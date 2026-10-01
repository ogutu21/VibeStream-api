import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { signToken, requireAuth } from "../tokens.js";
import { wrap } from "../util.js";

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COST = 12; // how slow hashing is on purpose; higher = harder to brute-force

// Used so a login for an unknown email takes as long as a real one,
// which stops attackers from discovering which emails have accounts by timing.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", COST);

// Only send the browser fields it should see (never the password hash).
const publicUser = (u) => ({ id: u.id, email: u.email, displayName: u.display_name });
const readEmail = (body) => String(body?.email ?? "").trim().toLowerCase();

// POST /auth/register  { email, password, displayName? }
router.post("/register", wrap(async (req, res) => {
  const email = readEmail(req.body);
  const password = String(req.body?.password ?? "");
  const displayName = String(req.body?.displayName ?? "").trim().slice(0, 50) || null;

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  // bcrypt only reads the first 72 bytes of a password, so cap it there.
  if (password.length < 8 || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ error: "Password must be at least 8 characters (72 max)." });
  }

  const hash = await bcrypt.hash(password, COST);

  let result;
  try {
    // The ? marks are filled in safely by the driver. NEVER build SQL by
    // gluing user input into a string: that is how SQL injection happens.
    [result] = await pool.execute(
      "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)",
      [email, hash, displayName]
    );
  } catch (err) {
    // The email column is UNIQUE, so MySQL rejects duplicates for us.
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    throw err;
  }

  const user = { id: result.insertId, email, display_name: displayName };
  res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
}));

// POST /auth/login  { email, password }
router.post("/login", wrap(async (req, res) => {
  const email = readEmail(req.body);
  const password = String(req.body?.password ?? "");

  const [rows] = await pool.execute(
    "SELECT id, email, display_name, password_hash FROM users WHERE email = ?",
    [email]
  );
  const user = rows[0];

  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    // Same message either way, so attackers can't tell which part was wrong.
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  res.json({ token: signToken(user.id), user: publicUser(user) });
}));

// GET /auth/me   (needs a valid token)
router.get("/me", requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT id, email, display_name FROM users WHERE id = ?",
    [req.userId]
  );
  if (!rows.length) return res.status(401).json({ error: "Account not found." });
  res.json({ user: publicUser(rows[0]) });
}));

export default router;
