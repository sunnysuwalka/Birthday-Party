// ============================================================
// src/Login.jsx
// ============================================================

import { useState } from "react";

export default function Login({ onLogin, externalError }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const displayedError = error || externalError;

  const handleNameChange = (event) => {
    const value = event.target.value;

    setName(value);
    setError("");

    // Admin is the ONLY person who needs a password.
    setShowPasswordField(
      value.trim().toLowerCase() === "admin"
    );

    // Clear password if user changes back from admin.
    if (value.trim().toLowerCase() !== "admin") {
      setPassword("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    const cleanName = name.trim();

    if (!cleanName) {
      setError("Please enter your name.");
      return;
    }

    const isAdmin =
      cleanName.toLowerCase() === "admin";

    if (isAdmin && !password.trim()) {
      setError("Please enter the admin password.");
      return;
    }

    setLoading(true);

    try {
      await onLogin({
        name: cleanName,
        ...(isAdmin
          ? { password }
          : {}),
      });
    } catch (err) {
      setError(
        err?.message ||
          "Authorization failed."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        width: "100%",
        boxSizing: "border-box",

        display: "flex",
        alignItems: "center",
        justifyContent: "center",

        background: "#f5f5f3",
        color: "#111",

        fontFamily:
          "Inter, Arial, Helvetica, sans-serif",

        padding: "40px 70px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1100,

          display: "grid",
          gridTemplateColumns:
            "1fr 1fr",

          alignItems: "center",

          gap: 100,
        }}
      >
        {/* ==================================================
            LEFT
        ================================================== */}

        <section>
          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.28em",
              fontWeight: 600,
              marginBottom: 28,
              color: "#777",
            }}
          >
            AURELIA
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(48px, 5vw, 78px)",
              lineHeight: 0.95,
              fontWeight: 500,
              letterSpacing: "-0.055em",
            }}
          >
            Enter
            <br />
            the resort.
          </h1>

          <div
            style={{
              width: 48,
              height: 1,
              background: "#111",
              marginTop: 34,
              marginBottom: 24,
            }}
          />

          <p
            style={{
              margin: 0,
              maxWidth: 380,
              fontSize: 14,
              lineHeight: 1.7,
              color: "#666",
            }}
          >
            Enter your name to continue.
            Authorization is required for
            administrative access.
          </p>
        </section>

        {/* ==================================================
            RIGHT — AUTHORIZATION
        ================================================== */}

        <section>
          <form
            onSubmit={handleSubmit}
            style={{
              width: "100%",
              maxWidth: 430,
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: 11,
                letterSpacing: "0.16em",
                fontWeight: 700,
                marginBottom: 12,
              }}
            >
              YOUR NAME
            </label>

            <input
              type="text"
              value={name}
              onChange={handleNameChange}
              placeholder="Enter your name"
              autoComplete="name"
              autoFocus
              style={{
                width: "100%",
                height: 58,
                boxSizing: "border-box",

                border: "none",
                borderBottom:
                  "1px solid #111",

                outline: "none",

                background:
                  "transparent",

                color: "#111",

                fontSize: 22,
                fontWeight: 400,

                padding: "0 2px",

                borderRadius: 0,
              }}
            />

            {/* ==================================================
                ADMIN PASSWORD
            ================================================== */}

            {showPasswordField && (
              <div
                style={{
                  marginTop: 30,
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    letterSpacing: "0.16em",
                    fontWeight: 700,
                    marginBottom: 12,
                  }}
                >
                  ADMIN PASSWORD
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(
                      event.target.value
                    );
                    setError("");
                  }}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  autoFocus
                  style={{
                    width: "100%",
                    height: 58,
                    boxSizing: "border-box",

                    border: "none",
                    borderBottom:
                      "1px solid #111",

                    outline: "none",

                    background:
                      "transparent",

                    color: "#111",

                    fontSize: 22,

                    padding: "0 2px",

                    borderRadius: 0,
                  }}
                />
              </div>
            )}

            {/* ==================================================
                ERROR
            ================================================== */}

            {displayedError && (
              <div
                style={{
                  marginTop: 22,
                  fontSize: 13,
                  color: "#b00000",
                }}
              >
                {displayedError}
              </div>
            )}

            {/* ==================================================
                ENTER
            ================================================== */}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 34,

                width: "100%",
                height: 56,

                border: "1px solid #111",
                borderRadius: 0,

                background:
                  loading
                    ? "#777"
                    : "#111",

                color: "#fff",

                cursor:
                  loading
                    ? "default"
                    : "pointer",

                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.16em",

                transition:
                  "background 0.2s ease",
              }}
            >
              {loading
                ? "AUTHORIZING..."
                : "ENTER"}
            </button>

            <div
              style={{
                marginTop: 18,
                fontSize: 11,
                color: "#999",
                lineHeight: 1.5,
              }}
            >
              {showPasswordField
                ? "Administrator authorization required."
                : "No password required."}
            </div>
          </form>
        </section>
      </div>

      {/* ======================================================
          SMALL SCREEN FALLBACK
      ====================================================== */}

      <style>
        {`
          input::placeholder {
            color: #aaa;
          }

          input:focus {
            border-bottom-color: #111 !important;
          }

          button:hover:not(:disabled) {
            background: #333 !important;
          }

          @media (max-width: 800px) {
            main > div {
              grid-template-columns: 1fr !important;
              gap: 55px !important;
            }
          }
        `}
      </style>
    </main>
  );
}