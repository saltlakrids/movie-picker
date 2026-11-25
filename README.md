# 🍿 Movie Picker

Pick what to watch on movie night, Tinder style.

1. **Log in** and start a **party** with the streaming services you have
   (Netflix, Disney+, HBO Max, DR TV, TV 2 Play, plus Viaplay, Prime Video, SkyShowtime).
2. **Invite** your movie buddy with a link or a 6-letter code.
3. Both of you **swipe** through popular movies on those services in Denmark.
   Movies your partner already liked come up first.
4. When **everyone** swipes right on the same movie, **it's a match** — add it to your shared **watchlist**.
5. After watching, each of you **rates it 1–10**. Scores stay hidden until you've rated it yourself,
   then the movie lands in your shared **library** with everyone's scores, averages and filters
   (“we loved”, “we disliked”, “split opinions”).

## Running it

Requires Node.js 22.13+ (uses the built-in `node:sqlite`, no native dependencies).

```bash
npm install
cp .env.example .env   # add your TMDB key
npm run dev            # API on :3001, app on http://localhost:5173
```

Production:

```bash
npm run build
npm start              # serves API + app on http://localhost:3001
```

Tests: `npm test`

### Movie data

Movies come from [TMDB](https://www.themoviedb.org/)'s discover API filtered by
`watch_region=DK` and each party's chosen services, sorted by popularity. Pages are fetched
lazily as you swipe and cached in SQLite for 24 hours. Provider ids are resolved by name from
TMDB's Danish provider list at startup.

Without `TMDB_API_KEY` / `TMDB_READ_TOKEN` the app runs on a small built-in demo catalog
(no posters, service availability is illustrative only) so you can try the flow offline.

## Stack

- `server/` — Express 5, SQLite (`node:sqlite`), bcrypt password hashing, httpOnly session cookies
- `web/` — React 19 + Vite, no UI framework; pointer-event swipe cards, keyboard ← → ↑
- Matches are pushed to the other member by polling every 5 s.

This product uses the TMDB API but is not endorsed or certified by TMDB.
