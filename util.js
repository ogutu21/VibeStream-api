// Small helpers: an async error wrapper + input cleaning.

// Lets route handlers be async without a try/catch in every one:
// if anything throws, the error goes to the error handler in server.js.
export const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const ID_RE = /^[\w-]{1,64}$/;
const isText = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
const isHttps = (v) => typeof v === "string" && v.length <= 600 && /^https:\/\//i.test(v);

// The browser sends us a song. Keep only the fields we know, with safe
// types and sizes. Anything else is thrown away. Returns null if unusable.
export function cleanTrack(t) {
  if (!t || typeof t !== "object") return null;
  const id = String(t.id ?? "");
  if (!ID_RE.test(id)) return null;
  if (!isText(t.name, 300) || !isText(t.artist_name, 300)) return null;
  if (!isHttps(t.audio)) return null;
  const duration = Number(t.duration);
  return {
    id,
    name: t.name,
    artist_name: t.artist_name,
    image: isHttps(t.image) ? t.image : "",
    audio: t.audio,
    duration: Number.isFinite(duration) ? Math.round(duration) : 0,
    license_ccurl: isHttps(t.license_ccurl) ? t.license_ccurl : "",
  };
}

// MySQL returns JSON columns as objects; MariaDB (used by XAMPP) returns text.
// This handles both.
export const parseTrack = (v) => (typeof v === "string" ? JSON.parse(v) : v);

// Ids chosen by the browser (playlist ids): letters, digits, _ and - only.
export const cleanId = (v) => (typeof v === "string" && ID_RE.test(v) ? v : null);

// Playlist names: trimmed, 1-100 characters.
export function cleanName(v) {
  if (typeof v !== "string") return null;
  const name = v.trim();
  return name && name.length <= 100 ? name : null;
}
