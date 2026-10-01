// Everything under /me: the logged-in user's own favorites, history and playlists.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../tokens.js";
import { cleanTrack, cleanId, cleanName, parseTrack, wrap } from "../util.js";

const router = Router();
router.use(requireAuth); // every route below needs a valid token

const HISTORY_LIMIT = 30;
const MAX_FAVORITES = 1000;
const MAX_PLAYLISTS = 100;
const MAX_PLAYLIST_TRACKS = 500;

// ---------- read helpers (used by the GET routes and /sync) ----------

async function getFavorites(userId) {
  const [rows] = await pool.execute(
    "SELECT track FROM favorites WHERE user_id = ? ORDER BY created_at DESC",
    [userId]
  );
  return rows.map((r) => parseTrack(r.track));
}

async function getHistory(userId) {
  const [rows] = await pool.execute(
    `SELECT track FROM history WHERE user_id = ? ORDER BY played_at DESC LIMIT ${HISTORY_LIMIT}`,
    [userId]
  );
  return rows.map((r) => parseTrack(r.track));
}

async function getPlaylists(userId) {
  const [lists] = await pool.execute(
    "SELECT id, name FROM playlists WHERE user_id = ? ORDER BY created_at",
    [userId]
  );
  const [songs] = await pool.execute(
    `SELECT pt.playlist_id, pt.track
     FROM playlist_tracks pt JOIN playlists p ON p.id = pt.playlist_id
     WHERE p.user_id = ? ORDER BY pt.seq`,
    [userId]
  );
  const byId = new Map(lists.map((p) => [p.id, { id: p.id, name: p.name, tracks: [] }]));
  songs.forEach((s) => byId.get(s.playlist_id)?.tracks.push(parseTrack(s.track)));
  return [...byId.values()];
}

// Songs have no user_id of their own, so prove the PLAYLIST is yours first.
async function ownsPlaylist(userId, playlistId) {
  const [rows] = await pool.execute(
    "SELECT 1 FROM playlists WHERE id = ? AND user_id = ?",
    [playlistId, userId]
  );
  return rows.length > 0;
}

// ---------- everything at once ----------

// GET /me/sync -> { favorites, playlists, history }
router.get("/sync", wrap(async (req, res) => {
  const [favorites, playlists, history] = await Promise.all([
    getFavorites(req.userId),
    getPlaylists(req.userId),
    getHistory(req.userId),
  ]);
  res.json({ favorites, playlists, history });
}));

// ---------- favorites ----------

router.get("/favorites", wrap(async (req, res) => {
  res.json(await getFavorites(req.userId));
}));

// PUT /me/favorites/:trackId  (body = the track). Safe to repeat.
router.put("/favorites/:trackId", wrap(async (req, res) => {
  const track = cleanTrack(req.body);
  if (!track || track.id !== req.params.trackId) {
    return res.status(400).json({ error: "Invalid track." });
  }
  const [[{ n }]] = await pool.execute(
    "SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?",
    [req.userId]
  );
  if (n >= MAX_FAVORITES) return res.status(400).json({ error: "Favorites limit reached." });

  await pool.execute(
    `INSERT INTO favorites (user_id, track_id, track) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE track_id = track_id`,
    [req.userId, track.id, JSON.stringify(track)]
  );
  res.status(204).end();
}));

router.delete("/favorites/:trackId", wrap(async (req, res) => {
  await pool.execute(
    "DELETE FROM favorites WHERE user_id = ? AND track_id = ?",
    [req.userId, req.params.trackId]
  );
  res.status(204).end();
}));

// ---------- recently played ----------

router.get("/history", wrap(async (req, res) => {
  res.json(await getHistory(req.userId));
}));

// POST /me/history (body = the track). Replaying a song just bumps its time.
router.post("/history", wrap(async (req, res) => {
  const track = cleanTrack(req.body);
  if (!track) return res.status(400).json({ error: "Invalid track." });
  const json = JSON.stringify(track);

  await pool.execute(
    `INSERT INTO history (user_id, track_id, track) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE played_at = CURRENT_TIMESTAMP(3), track = ?`,
    [req.userId, track.id, json, json]
  );
  // Keep only the newest HISTORY_LIMIT rows (the "keep" wrapper is required
  // because MySQL won't delete from a table it is also selecting from).
  await pool.execute(
    `DELETE FROM history
     WHERE user_id = ? AND track_id NOT IN (
       SELECT track_id FROM (
         SELECT track_id FROM history WHERE user_id = ?
         ORDER BY played_at DESC LIMIT ${HISTORY_LIMIT}
       ) AS keep
     )`,
    [req.userId, req.userId]
  );
  res.status(204).end();
}));

// ---------- playlists ----------

router.get("/playlists", wrap(async (req, res) => {
  res.json(await getPlaylists(req.userId));
}));

// POST /me/playlists  { id, name }. Safe to repeat.
router.post("/playlists", wrap(async (req, res) => {
  const id = cleanId(req.body?.id);
  const name = cleanName(req.body?.name);
  if (!id || !name) return res.status(400).json({ error: "A playlist needs an id and a name." });

  const [[{ n }]] = await pool.execute(
    "SELECT COUNT(*) AS n FROM playlists WHERE user_id = ?",
    [req.userId]
  );
  if (n >= MAX_PLAYLISTS && !(await ownsPlaylist(req.userId, id))) {
    return res.status(400).json({ error: "Playlist limit reached." });
  }

  await pool.execute(
    `INSERT INTO playlists (id, user_id, name) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [id, req.userId, name]
  );
  // If that id already existed, make sure it's OURS and not someone else's.
  if (!(await ownsPlaylist(req.userId, id))) {
    return res.status(409).json({ error: "That playlist id is taken." });
  }
  res.status(204).end();
}));

// PATCH /me/playlists/:id  { name }
router.patch("/playlists/:id", wrap(async (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: "Enter a name." });
  if (!(await ownsPlaylist(req.userId, req.params.id))) {
    return res.status(404).json({ error: "Playlist not found." });
  }
  await pool.execute(
    "UPDATE playlists SET name = ? WHERE id = ? AND user_id = ?",
    [name, req.params.id, req.userId]
  );
  res.status(204).end();
}));

// DELETE /me/playlists/:id  (its songs are deleted automatically)
router.delete("/playlists/:id", wrap(async (req, res) => {
  await pool.execute(
    "DELETE FROM playlists WHERE id = ? AND user_id = ?",
    [req.params.id, req.userId]
  );
  res.status(204).end();
}));

// PUT /me/playlists/:id/tracks/:trackId  (body = the track)
router.put("/playlists/:id/tracks/:trackId", wrap(async (req, res) => {
  const track = cleanTrack(req.body);
  if (!track || track.id !== req.params.trackId) {
    return res.status(400).json({ error: "Invalid track." });
  }
  if (!(await ownsPlaylist(req.userId, req.params.id))) {
    return res.status(404).json({ error: "Playlist not found." });
  }
  const [[{ n }]] = await pool.execute(
    "SELECT COUNT(*) AS n FROM playlist_tracks WHERE playlist_id = ?",
    [req.params.id]
  );
  if (n >= MAX_PLAYLIST_TRACKS) return res.status(400).json({ error: "Playlist is full." });

  await pool.execute(
    `INSERT INTO playlist_tracks (playlist_id, track_id, track) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE track_id = track_id`,
    [req.params.id, track.id, JSON.stringify(track)]
  );
  res.status(204).end();
}));

// DELETE /me/playlists/:id/tracks/:trackId
router.delete("/playlists/:id/tracks/:trackId", wrap(async (req, res) => {
  if (!(await ownsPlaylist(req.userId, req.params.id))) {
    return res.status(404).json({ error: "Playlist not found." });
  }
  await pool.execute(
    "DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?",
    [req.params.id, req.params.trackId]
  );
  res.status(204).end();
}));

export default router;
