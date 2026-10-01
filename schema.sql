-- Step 1: users. More tables (favorites, playlists, history) come in later steps.
-- Run once with:  mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS vibestream
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE vibestream;

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(50),
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Step 3: favorites and recently played.
-- A "track" is stored as a JSON snapshot of what Jamendo returned
-- (name, artist, image, audio URL), so the app can show it without re-fetching.
-- ON DELETE CASCADE: deleting a user also deletes their saved data.

CREATE TABLE IF NOT EXISTS favorites (
  user_id    INT NOT NULL,
  track_id   VARCHAR(64) NOT NULL,
  track      JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, track_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS history (
  user_id   INT NOT NULL,
  track_id  VARCHAR(64) NOT NULL,
  track     JSON NOT NULL,
  played_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, track_id),
  KEY history_recent_idx (user_id, played_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Step 4: playlists.
-- The playlist id is created by the browser (a random string), so the app can
-- create a playlist instantly and the ids always match between browser and server.
CREATE TABLE IF NOT EXISTS playlists (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id    INT NOT NULL,
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY playlists_user_idx (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- seq remembers the order songs were added in.
CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id VARCHAR(64) NOT NULL,
  track_id    VARCHAR(64) NOT NULL,
  track       JSON NOT NULL,
  seq         BIGINT NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (playlist_id, track_id),
  UNIQUE KEY playlist_tracks_seq (seq),
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
) ENGINE=InnoDB;
