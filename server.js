import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pool } from "./db.js";
import authRoutes from "./routes/authRoutes.js";
import libraryRoutes from "./routes/libraryRoutes.js";

// Refuse to start if the secret is missing: an unsigned app is an open door.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET is missing or too short (use 32+ random characters).");
  process.exit(1);
}

const app = express();

// Hosts put a proxy in front of the app. Trusting it (1 hop) lets the rate
// limiter see each visitor's real IP instead of the proxy's.
app.set("trust proxy", 1);

// Safe default security headers.
app.use(helmet());

// Parse JSON request bodies
app.use(express.json({ limit: "1mb" }));

// Only let our own frontend call this API from a browser.
const allowed = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: allowed.length ? allowed : true }));

// Health check: proves the server is up AND can reach the database
app.get("/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT NOW() AS time");
    res.json({ status: "ok", dbTime: rows[0].time });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "Database unreachable" });
  }
});

// Slow down password guessing: 30 attempts per 15 minutes per IP address.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a few minutes." },
});
app.use("/auth", authLimiter, authRoutes);
app.use("/me", libraryRoutes);

// Anything that didn't match a route
app.use((req, res) => res.status(404).json({ error: "Not found." }));

// Last line of defense: log the real error, but never leak details to the client.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Something went wrong." });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`VibeStream API running on http://localhost:${port}`);
});
