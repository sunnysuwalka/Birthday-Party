// ============================================================
// server/index.js
// ============================================================

const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();

// ============================================================
// CORS / ORIGIN CONFIG
// ============================================================
// In dev, CLIENT_ORIGIN is unset -> falls back to "*" (same as before).
// In prod, set CLIENT_ORIGIN to your deployed frontend's exact URL,
// e.g. https://your-frontend-domain.com
// Supports a comma-separated list if you need more than one origin
// (e.g. a preview URL + a production URL).
const rawOrigins = process.env.CLIENT_ORIGIN;
const ALLOWED_ORIGINS = rawOrigins
  ? rawOrigins.split(",").map((origin) => origin.trim()).filter(Boolean)
  : "*";

const corsOptions = {
  origin: ALLOWED_ORIGINS,
  methods: ["GET", "POST"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: corsOptions,
});


// ============================================================
// CONFIG
// ============================================================

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "admin123";

const ADMIN_SPAWN = [0, 0.8, -2];

const RISHIKA_SPAWN = [0, 0.8, 18];

// Radius at which Rishika can say Hello.
const HELLO_RADIUS = 3.2;


// ============================================================
// STATE
// ============================================================

const players = {};

let storyState =
  "WAITING_FOR_RISHIKA";


// ============================================================
// HEALTH CHECK
// ============================================================
// Deployment platforms (Render, Railway, Fly, etc.) ping "/" to confirm
// the service is alive — keep this reachable with no auth.

app.get("/", (_req, res) => {
  res.json({
    status: "online",
    service: "birthday-world-server",
    players:
      Object.keys(players).length,
    storyState,
  });
});

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});


// ============================================================
// PUBLIC PLAYER DATA
// ============================================================

function publicPlayer(player) {
  return {
    id: player.id,

    name: player.name,

    role: player.role,

    gender: player.gender,

    position: player.position,

    rotation: player.rotation,

    movementLocked:
      player.movementLocked,
  };
}


// ============================================================
// HELPERS
// ============================================================

function getAdmin() {
  return Object.values(players).find(
    (player) =>
      player.role === "admin"
  );
}

function getRishika() {
  return Object.values(players).find(
    (player) =>
      player.name.toLowerCase() ===
      "rishika"
  );
}

function getDistanceXZ(a, b) {
  const dx =
    a.position[0] -
    b.position[0];

  const dz =
    a.position[2] -
    b.position[2];

  return Math.sqrt(
    dx * dx +
    dz * dz
  );
}


// ============================================================
// SOCKET EMITTERS
// ============================================================

function emitStoryState() {
  io.emit("storyState", {
    state: storyState,
  });
}

function emitPlayers() {
  io.emit(
    "currentPlayers",
    Object.values(players).map(
      publicPlayer
    )
  );
}


// ============================================================
// AUTHENTICATION
// ============================================================

io.use((socket, next) => {
  const auth =
    socket.handshake.auth || {};

  const rawName =
    typeof auth.name === "string"
      ? auth.name
      : "";

  const cleanName =
    rawName.trim();

  if (!cleanName) {
    return next(
      new Error("Name is required")
    );
  }


  // ==========================================================
  // ADMIN
  // ==========================================================

  const isAdmin =
    cleanName.toLowerCase() ===
    "admin";

  if (isAdmin) {
    const password =
      typeof auth.password ===
      "string"
        ? auth.password
        : "";

    if (
      password !==
      ADMIN_PASSWORD
    ) {
      return next(
        new Error(
          "Invalid admin password"
        )
      );
    }

    socket.user = {
      name: "Admin",
      role: "admin",
      gender: "male",
    };

    return next();
  }


  // ==========================================================
  // NORMAL PLAYER
  // ==========================================================

  socket.user = {
    name: cleanName,

    role: "player",

    gender:
      cleanName.toLowerCase() ===
      "rishika"
        ? "female"
        : "female",
  };

  next();
});


// ============================================================
// CONNECTION
// ============================================================

io.on("connection", (socket) => {
  const {
    name,
    role,
    gender,
  } = socket.user;

  const isAdmin =
    role === "admin";


  // ==========================================================
  // SPAWN
  // ==========================================================

  const spawn =
    isAdmin
      ? ADMIN_SPAWN
      : RISHIKA_SPAWN;


  // ==========================================================
  // PLAYER
  // ==========================================================

  const player = {
    id: socket.id,

    name,

    role,

    gender,

    position: [...spawn],

    rotation: 0,

    // --------------------------------------------------------
    // ADMIN:
    // Locked at his fixed resort position.
    //
    // RISHIKA:
    // Free to move immediately so she can follow the path.
    // --------------------------------------------------------

    movementLocked:
      isAdmin,
  };


  players[socket.id] =
    player;


  // ==========================================================
  // AUTHENTICATED
  // ==========================================================

  socket.emit(
    "authenticated",
    {
      player:
        publicPlayer(player),

      storyState,

      adminPresent:
        !!getAdmin(),

      rishikaPresent:
        !!getRishika(),
    }
  );


  emitPlayers();


  // ==========================================================
  // RISHIKA JOINED
  // ==========================================================

  if (
    !isAdmin &&
    name.toLowerCase() ===
      "rishika"
  ) {
    storyState =
      "RISHIKA_APPROACHING";


    // Tell everyone that Rishika
    // has entered the resort.

    io.emit(
      "rishikaJoined",
      {
        name,
      }
    );


    // Send the instruction to Rishika.

    socket.emit(
      "storyMessage",
      {
        type: "FOLLOW_PATH",

        text:
          "Follow the path.",
      }
    );


    emitStoryState();
  }


  // ==========================================================
  // PLAYER MOVEMENT
  // ==========================================================

  socket.on(
    "playerMove",
    (data) => {
      const current =
        players[socket.id];

      if (!current) return;


      // Admin cannot move until Hello.

      if (
        current.movementLocked
      ) {
        return;
      }


      if (
        !data ||
        !Array.isArray(
          data.position
        ) ||
        data.position.length !== 3
      ) {
        return;
      }


      const position =
        data.position.map(Number);


      if (
        position.some(
          (value) =>
            !Number.isFinite(
              value
            )
        )
      ) {
        return;
      }


      current.position =
        position;


      const rotation =
        Number(data.rotation);


      if (
        Number.isFinite(rotation)
      ) {
        current.rotation =
          rotation;
      }


      socket.broadcast.emit(
        "playerMoved",
        publicPlayer(current)
      );


      // ------------------------------------------------------
      // CHECK RISHIKA / ADMIN DISTANCE
      // ------------------------------------------------------

      if (
        current.name.toLowerCase() ===
        "rishika" &&
        storyState ===
          "RISHIKA_APPROACHING"
      ) {
        const admin =
          getAdmin();

        if (!admin) return;


        const distance =
          getDistanceXZ(
            current,
            admin
          );


        if (
          distance <=
          HELLO_RADIUS
        ) {
          storyState =
            "RISHIKA_NEAR_ADMIN";


          // Only Rishika gets the button.

          socket.emit(
            "showHelloButton"
          );


          emitStoryState();
        }
      }
    }
  );


  // ==========================================================
  // SAY HELLO
  // ==========================================================

  socket.on(
    "sayHello",
    () => {
      const current =
        players[socket.id];

      if (!current) return;


      // Only Rishika can initiate Hello.

      if (
        current.name.toLowerCase() !==
        "rishika"
      ) {
        return;
      }


      if (
        storyState !==
          "RISHIKA_NEAR_ADMIN" &&
        storyState !==
          "RISHIKA_APPROACHING"
      ) {
        return;
      }


      const admin =
        getAdmin();

      if (!admin) return;


      // Server checks the actual
      // distance again.
      //
      // This prevents the client
      // from faking proximity.

      const distance =
        getDistanceXZ(
          current,
          admin
        );


      if (
        distance >
        HELLO_RADIUS
      ) {
        return;
      }


      // ======================================================
      // STORY COMPLETE
      // ======================================================

      storyState = "FREE";


      // Admin is now free.

      admin.movementLocked =
        false;


      // Rishika is already free,
      // but explicitly ensure it.

      current.movementLocked =
        false;


      // ======================================================
      // HELLO MESSAGE
      // ======================================================

      io.emit(
        "hello",
        {
          from:
            current.id,

          fromName:
            current.name,

          to:
            admin.id,

          text:
            "Hello",

          createdAt:
            Date.now(),
        }
      );


      // ======================================================
      // UNLOCK
      // ======================================================

      io.emit(
        "unlockPlayers"
      );


      emitPlayers();

      emitStoryState();
    }
  );


  // ==========================================================
  // CHAT
  // ==========================================================

  socket.on(
    "chatMessage",
    (text) => {
      const current =
        players[socket.id];

      if (!current) return;


      // Chat is unavailable
      // until Hello.

      if (
        storyState !==
        "FREE"
      ) {
        return;
      }


      if (
        typeof text !==
        "string"
      ) {
        return;
      }


      const message =
        text
          .trim()
          .slice(0, 180);


      if (!message) return;


      const createdAt =
        Date.now();


      // Broadcast to EVERYONE.

      io.emit(
        "chatMessage",
        {
          id:
            `${socket.id}-${createdAt}`,

          playerId:
            socket.id,

          name:
            current.name,

          text:
            message,

          createdAt,
        }
      );
    }
  );


  // ==========================================================
  // DISCONNECT
  // ==========================================================

  socket.on(
    "disconnect",
    () => {
      delete players[
        socket.id
      ];


      const admin =
        getAdmin();

      const rishika =
        getRishika();


      // ------------------------------------------------------
      // Reset story before it reaches FREE.
      // ------------------------------------------------------

      if (
        storyState !== "FREE"
      ) {
        if (
          !admin ||
          !rishika
        ) {
          storyState =
            "WAITING_FOR_RISHIKA";
        }
      }


      emitPlayers();

      emitStoryState();
    }
  );
});


// ============================================================
// START SERVER
// ============================================================
// Bind to 0.0.0.0 explicitly — most hosts (Render, Railway, Fly, etc.)
// require this instead of the default localhost-only bind so the
// container's external network can actually reach the process.

const PORT =
  process.env.PORT || 3001;

httpServer.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Server running on port ${PORT}`
    );
  }
);