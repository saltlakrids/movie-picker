import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(file = process.env.DB_FILE || 'data/movie-picker.db') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      providers TEXT NOT NULL,              -- JSON array of provider keys
      max_members INTEGER NOT NULL DEFAULT 2,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS party_members (
      party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (party_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY,               -- TMDB id (demo ids are >= 9000000)
      title TEXT NOT NULL,
      overview TEXT NOT NULL DEFAULT '',
      poster_path TEXT,
      backdrop_path TEXT,
      release_date TEXT,
      vote_average REAL NOT NULL DEFAULT 0,
      popularity REAL NOT NULL DEFAULT 0,
      genres TEXT NOT NULL DEFAULT '[]',    -- JSON array of genre names
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS movie_providers (
      movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      PRIMARY KEY (movie_id, provider)
    );

    CREATE TABLE IF NOT EXISTS catalog_pages (
      provider TEXT NOT NULL,
      page INTEGER NOT NULL,
      total_pages INTEGER NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (provider, page)
    );

    CREATE TABLE IF NOT EXISTS swipes (
      party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      liked INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (party_id, user_id, movie_id)
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      added_by INTEGER NOT NULL REFERENCES users(id),
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      watched_at TEXT,
      PRIMARY KEY (party_id, movie_id)
    );

    CREATE TABLE IF NOT EXISTS ratings (
      party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
      comment TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (party_id, user_id, movie_id)
    );

    CREATE INDEX IF NOT EXISTS idx_movies_popularity ON movies(popularity DESC);
    CREATE INDEX IF NOT EXISTS idx_swipes_movie ON swipes(party_id, movie_id);
  `);
  return db;
}

/** Run fn inside a transaction. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
