import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { tx } from './db.js';
import { PROVIDER_KEYS, DEFAULT_PROVIDERS, publicProviders } from './providers.js';

const COOKIE = 'mp_sid';
const SESSION_DAYS = 60;
const MAX_MEMBERS_LIMIT = 8;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);

export function createApp({ db, catalog, staticDir }) {
  const app = express();
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());

  // ---------- helpers ----------
  const q = {
    userBySession: db.prepare(`SELECT u.id, u.username, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.created_at > datetime('now', '-${SESSION_DAYS} days')`),
    members: db.prepare(`SELECT u.id, u.username, u.display_name FROM party_members m JOIN users u ON u.id = m.user_id
      WHERE m.party_id = ? ORDER BY m.joined_at, u.id`),
    memberCount: db.prepare('SELECT COUNT(*) n FROM party_members WHERE party_id = ?'),
    isMember: db.prepare('SELECT 1 FROM party_members WHERE party_id = ? AND user_id = ?'),
    party: db.prepare('SELECT * FROM parties WHERE id = ?'),
    movie: db.prepare('SELECT * FROM movies WHERE id = ?'),
    movieProviders: db.prepare('SELECT provider FROM movie_providers WHERE movie_id = ?'),
    isMatch: db.prepare(`SELECT (SELECT COUNT(*) FROM swipes s JOIN party_members m ON m.party_id = s.party_id AND m.user_id = s.user_id
        WHERE s.party_id = ? AND s.movie_id = ? AND s.liked = 1) AS likes,
      (SELECT COUNT(*) FROM party_members WHERE party_id = ?) AS members`),
  };

  function serializeMovie(m) {
    if (!m) return null;
    return {
      id: m.id,
      title: m.title,
      overview: m.overview,
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w780${m.backdrop_path}` : null,
      year: m.release_date ? Number(m.release_date.slice(0, 4)) || null : null,
      voteAverage: Math.round((m.vote_average || 0) * 10) / 10,
      genres: JSON.parse(m.genres || '[]'),
      providers: q.movieProviders.all(m.id).map((r) => r.provider),
      demo: m.id >= 9000000,
    };
  }

  const serializeUser = (u) => ({ id: u.id, username: u.username, displayName: u.display_name });

  function serializeParty(p) {
    return {
      id: p.id,
      name: p.name,
      inviteCode: p.invite_code,
      providers: JSON.parse(p.providers),
      maxMembers: p.max_members,
      createdBy: p.created_by,
      members: q.members.all(p.id).map(serializeUser),
    };
  }

  function newToken() {
    return crypto.randomBytes(32).toString('base64url');
  }

  function newInviteCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      let code = '';
      for (const b of crypto.randomBytes(6)) code += alphabet[b % alphabet.length];
      if (!db.prepare('SELECT 1 FROM parties WHERE invite_code = ?').get(code)) return code;
    }
  }

  function startSession(res, userId) {
    const token = newToken();
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: SESSION_DAYS * 864e5,
    });
  }

  function cleanProviders(list) {
    if (!Array.isArray(list)) return DEFAULT_PROVIDERS;
    const ok = [...new Set(list.filter((k) => PROVIDER_KEYS.includes(k)))];
    if (!ok.length) throw bad('Pick at least one streaming service');
    return ok;
  }

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  function auth(req, res, next) {
    const token = req.cookies[COOKIE];
    const user = token && q.userBySession.get(token);
    if (!user) return next(new HttpError(401, 'Not logged in'));
    req.user = user;
    next();
  }

  function partyAccess(req, res, next) {
    const id = Number(req.params.partyId);
    const party = Number.isInteger(id) && q.party.get(id);
    if (!party || !q.isMember.get(id, req.user.id)) return next(new HttpError(404, 'Party not found'));
    req.party = party;
    next();
  }

  // ---------- public ----------
  app.get('/api/config', (req, res) => {
    res.json({ providers: publicProviders(), live: catalog.live, region: catalog.region });
  });

  app.post('/api/auth/register', wrap(async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const displayName = String(req.body.displayName || '').trim() || username;
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) throw bad('Username must be 3–30 letters, digits, . _ or -');
    if (password.length < 6) throw bad('Password must be at least 6 characters');
    if (displayName.length > 40) throw bad('Display name is too long');
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'Username is taken');
    const hash = await bcrypt.hash(password, 10);
    const { lastInsertRowid } = db.prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)')
      .run(username, displayName, hash);
    startSession(res, Number(lastInsertRowid));
    res.status(201).json({ user: serializeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid)) });
  }));

  app.post('/api/auth/login', wrap(async (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.body.username || '').trim());
    const ok = user && (await bcrypt.compare(String(req.body.password || ''), user.password_hash));
    if (!ok) throw new HttpError(401, 'Wrong username or password');
    startSession(res, user.id);
    res.json({ user: serializeUser(user) });
  }));

  app.post('/api/auth/logout', (req, res) => {
    const token = req.cookies[COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  // ---------- authenticated ----------
  app.use('/api', auth);

  app.get('/api/me', (req, res) => res.json({ user: serializeUser(req.user) }));

  app.get('/api/parties', (req, res) => {
    const parties = db.prepare(`SELECT p.* FROM parties p JOIN party_members m ON m.party_id = p.id
      WHERE m.user_id = ? ORDER BY m.joined_at DESC`).all(req.user.id);
    res.json({ parties: parties.map(serializeParty) });
  });

  app.post('/api/parties', (req, res) => {
    const name = String(req.body.name || '').trim() || 'Movie night';
    if (name.length > 60) throw bad('Name is too long');
    const providers = cleanProviders(req.body.providers);
    const maxMembers = Math.min(Math.max(Number(req.body.maxMembers) || 2, 2), MAX_MEMBERS_LIMIT);
    const id = tx(db, () => {
      const { lastInsertRowid } = db.prepare(`INSERT INTO parties (name, invite_code, providers, max_members, created_by)
        VALUES (?, ?, ?, ?, ?)`).run(name, newInviteCode(), JSON.stringify(providers), maxMembers, req.user.id);
      db.prepare('INSERT INTO party_members (party_id, user_id) VALUES (?, ?)').run(lastInsertRowid, req.user.id);
      return Number(lastInsertRowid);
    });
    res.status(201).json({ party: serializeParty(q.party.get(id)) });
  });

  app.post('/api/parties/join', (req, res) => {
    const code = String(req.body.code || '').trim().toUpperCase();
    const party = db.prepare('SELECT * FROM parties WHERE invite_code = ?').get(code);
    if (!party) throw new HttpError(404, 'No party with that invite code');
    if (!q.isMember.get(party.id, req.user.id)) {
      if (q.memberCount.get(party.id).n >= party.max_members) throw new HttpError(409, 'This party is full');
      db.prepare('INSERT INTO party_members (party_id, user_id) VALUES (?, ?)').run(party.id, req.user.id);
    }
    res.json({ party: serializeParty(party) });
  });

  app.get('/api/invites/:code', (req, res) => {
    const party = db.prepare('SELECT * FROM parties WHERE invite_code = ?').get(String(req.params.code).toUpperCase());
    if (!party) throw new HttpError(404, 'No party with that invite code');
    const p = serializeParty(party);
    res.json({ invite: { name: p.name, members: p.members.map((m) => m.displayName), full: p.members.length >= p.maxMembers,
      alreadyMember: p.members.some((m) => m.id === req.user.id), partyId: p.id } });
  });

  const party = express.Router({ mergeParams: true });
  app.use('/api/parties/:partyId', partyAccess, party);

  party.get('/', (req, res) => res.json({ party: serializeParty(req.party) }));

  party.patch('/', (req, res) => {
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name || name.length > 60) throw bad('Invalid name');
      db.prepare('UPDATE parties SET name = ? WHERE id = ?').run(name, req.party.id);
    }
    if (req.body.providers !== undefined) {
      db.prepare('UPDATE parties SET providers = ? WHERE id = ?').run(JSON.stringify(cleanProviders(req.body.providers)), req.party.id);
    }
    res.json({ party: serializeParty(q.party.get(req.party.id)) });
  });

  party.delete('/members/me', (req, res) => {
    tx(db, () => {
      db.prepare('DELETE FROM party_members WHERE party_id = ? AND user_id = ?').run(req.party.id, req.user.id);
      if (!q.memberCount.get(req.party.id).n) db.prepare('DELETE FROM parties WHERE id = ?').run(req.party.id);
    });
    res.json({ ok: true });
  });

  // ----- swiping -----
  function deckQuery(providers, limit) {
    const ph = providers.map(() => '?').join(',');
    return {
      sql: `SELECT m.*,
          (SELECT COUNT(*) FROM swipes o WHERE o.party_id = ? AND o.movie_id = m.id AND o.user_id != ? AND o.liked = 1) AS others_liked
        FROM movies m
        WHERE EXISTS (SELECT 1 FROM movie_providers mp WHERE mp.movie_id = m.id AND mp.provider IN (${ph}))
          AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.party_id = ? AND s.user_id = ? AND s.movie_id = m.id)
        ORDER BY (others_liked > 0) DESC, m.popularity DESC, m.id
        ${limit ? 'LIMIT ?' : ''}`,
    };
  }

  party.get('/deck', wrap(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const providers = JSON.parse(req.party.providers);
    const { id: pid } = req.party;
    const uid = req.user.id;
    const countUnswiped = () => {
      const ph = providers.map(() => '?').join(',');
      return db.prepare(`SELECT COUNT(*) n FROM movies m
        WHERE EXISTS (SELECT 1 FROM movie_providers mp WHERE mp.movie_id = m.id AND mp.provider IN (${ph}))
          AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.party_id = ? AND s.user_id = ? AND s.movie_id = m.id)`)
        .get(...providers, pid, uid).n;
    };
    await catalog.ensureAvailable(providers, countUnswiped, limit * 2);
    const rows = db.prepare(deckQuery(providers, true).sql).all(pid, uid, ...providers, pid, uid, limit);
    res.json({ movies: rows.map((r) => ({ ...serializeMovie(r), othersLiked: r.others_liked })) });
  }));

  party.post('/swipes', (req, res) => {
    const movieId = Number(req.body.movieId);
    const movie = q.movie.get(movieId);
    if (!movie) throw bad('Unknown movie');
    const liked = req.body.liked ? 1 : 0;
    db.prepare(`INSERT INTO swipes (party_id, user_id, movie_id, liked) VALUES (?, ?, ?, ?)
      ON CONFLICT(party_id, user_id, movie_id) DO UPDATE SET liked = excluded.liked, created_at = datetime('now')`)
      .run(req.party.id, req.user.id, movieId, liked);
    const { likes, members } = q.isMatch.get(req.party.id, movieId, req.party.id);
    const match = liked && members >= 2 && likes >= members;
    res.json({ match: match ? serializeMovie(movie) : null });
  });

  party.delete('/swipes/:movieId', (req, res) => {
    db.prepare('DELETE FROM swipes WHERE party_id = ? AND user_id = ? AND movie_id = ?')
      .run(req.party.id, req.user.id, Number(req.params.movieId));
    res.json({ ok: true });
  });

  // ----- matches -----
  party.get('/matches', (req, res) => {
    const rows = db.prepare(`SELECT m.*, MAX(s.created_at) AS matched_at,
        EXISTS (SELECT 1 FROM watchlist w WHERE w.party_id = ? AND w.movie_id = m.id) AS in_watchlist
      FROM swipes s JOIN party_members pm ON pm.party_id = s.party_id AND pm.user_id = s.user_id
      JOIN movies m ON m.id = s.movie_id
      WHERE s.party_id = ? AND s.liked = 1
      GROUP BY m.id
      HAVING COUNT(*) >= (SELECT COUNT(*) FROM party_members WHERE party_id = ?)
        AND (SELECT COUNT(*) FROM party_members WHERE party_id = ?) >= 2
      ORDER BY matched_at DESC`).all(req.party.id, req.party.id, req.party.id, req.party.id);
    res.json({ matches: rows.map((r) => ({ ...serializeMovie(r), matchedAt: r.matched_at, inWatchlist: !!r.in_watchlist })) });
  });

  // ----- watchlist -----
  function ratingsFor(partyId, movieId, viewerId) {
    const members = q.members.all(partyId);
    const rows = db.prepare('SELECT user_id, score, comment, updated_at FROM ratings WHERE party_id = ? AND movie_id = ?')
      .all(partyId, movieId);
    const byUser = Object.fromEntries(rows.map((r) => [r.user_id, r]));
    const iRated = !!byUser[viewerId];
    // Other members' scores stay hidden until you've rated it yourself (no peeking/anchoring).
    return members.map((u) => {
      const r = byUser[u.id];
      const visible = r && (u.id === viewerId || iRated);
      return {
        user: serializeUser(u),
        rated: !!r,
        score: visible ? r.score : null,
        comment: visible ? r.comment : null,
        updatedAt: r ? r.updated_at : null,
      };
    });
  }

  function watchlistEntry(row, viewerId) {
    const ratings = ratingsFor(row.party_id, row.movie_id, viewerId);
    const visible = ratings.filter((r) => r.score != null);
    const all = ratings.every((r) => r.rated);
    return {
      movie: serializeMovie(q.movie.get(row.movie_id)),
      addedAt: row.added_at,
      addedBy: row.added_by,
      watchedAt: row.watched_at,
      ratings,
      average: all && visible.length === ratings.length
        ? Math.round((visible.reduce((a, r) => a + r.score, 0) / visible.length) * 10) / 10
        : null,
    };
  }

  party.get('/watchlist', (req, res) => {
    const rows = db.prepare(`SELECT * FROM watchlist WHERE party_id = ? AND watched_at IS NULL ORDER BY added_at DESC`)
      .all(req.party.id);
    res.json({ watchlist: rows.map((r) => watchlistEntry(r, req.user.id)) });
  });

  party.post('/watchlist', (req, res) => {
    const movieId = Number(req.body.movieId);
    const { likes, members } = q.isMatch.get(req.party.id, movieId, req.party.id);
    if (!(members >= 2 && likes >= members)) throw new HttpError(409, 'Only movies everyone liked can go on the watchlist');
    db.prepare('INSERT OR IGNORE INTO watchlist (party_id, movie_id, added_by) VALUES (?, ?, ?)')
      .run(req.party.id, movieId, req.user.id);
    res.status(201).json({ ok: true });
  });

  function watchlistRow(req) {
    const row = db.prepare('SELECT * FROM watchlist WHERE party_id = ? AND movie_id = ?').get(req.party.id, Number(req.params.movieId));
    if (!row) throw new HttpError(404, 'Not on the watchlist');
    return row;
  }

  party.delete('/watchlist/:movieId', (req, res) => {
    const row = watchlistRow(req);
    db.prepare('DELETE FROM ratings WHERE party_id = ? AND movie_id = ?').run(row.party_id, row.movie_id);
    db.prepare('DELETE FROM watchlist WHERE party_id = ? AND movie_id = ?').run(row.party_id, row.movie_id);
    res.json({ ok: true });
  });

  party.post('/watchlist/:movieId/watched', (req, res) => {
    const row = watchlistRow(req);
    const watched = req.body.watched !== false;
    db.prepare(`UPDATE watchlist SET watched_at = ${watched ? "COALESCE(watched_at, datetime('now'))" : 'NULL'}
      WHERE party_id = ? AND movie_id = ?`).run(row.party_id, row.movie_id);
    res.json({ ok: true });
  });

  party.put('/ratings/:movieId', (req, res) => {
    const row = watchlistRow(req);
    const score = Number(req.body.score);
    if (!Number.isInteger(score) || score < 1 || score > 10) throw bad('Score must be a whole number from 1 to 10');
    const comment = String(req.body.comment || '').trim().slice(0, 500);
    tx(db, () => {
      db.prepare(`INSERT INTO ratings (party_id, user_id, movie_id, score, comment) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(party_id, user_id, movie_id) DO UPDATE SET score = excluded.score, comment = excluded.comment,
          updated_at = datetime('now')`).run(row.party_id, req.user.id, row.movie_id, score, comment);
      db.prepare("UPDATE watchlist SET watched_at = COALESCE(watched_at, datetime('now')) WHERE party_id = ? AND movie_id = ?")
        .run(row.party_id, row.movie_id);
    });
    res.json({ entry: watchlistEntry(watchlistRow(req), req.user.id) });
  });

  party.get('/library', (req, res) => {
    const rows = db.prepare(`SELECT * FROM watchlist WHERE party_id = ? AND watched_at IS NOT NULL ORDER BY watched_at DESC`)
      .all(req.party.id);
    res.json({ library: rows.map((r) => watchlistEntry(r, req.user.id)) });
  });

  // ---------- errors / static ----------
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
  });

  return app;
}
