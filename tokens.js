import jwt from "jsonwebtoken";

// Creates the token given to the browser after a successful login.
// It contains the user's id, is signed with JWT_SECRET, and expires in 7 days.
export function signToken(userId) {
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: String(userId),
    expiresIn: "7d",
    algorithm: "HS256",
  });
}

// Middleware: put it in front of any route that needs a logged-in user.
// It checks the "Authorization: Bearer <token>" header and sets req.userId.
export function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Please log in." });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    req.userId = Number(payload.sub);
    next();
  } catch {
    res.status(401).json({ error: "Your session expired. Please log in again." });
  }
}
