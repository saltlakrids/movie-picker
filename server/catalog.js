import { PROVIDERS } from './providers.js';
import { DEMO_MOVIES } from './demo-movies.js';
import { tx } from './db.js';

const TMDB = 'https://api.themoviedb.org/3';
const GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller',
  10752: 'War', 37: 'Western',
};
const PAGE_TTL_HOURS = 24;

export function createCatalog(db, env = process.env, fetchImpl = globalThis.fetch) {
  // Accept either credential in either variable: a v4 read token is a JWT
  // (contains dots), a v3 API key is a short hex string. Tolerate a pasted "Bearer " prefix.
  const clean = (v) => (v || '').trim().replace(/^bearer\s+/i, '');
  const creds = [clean(env.TMDB_READ_TOKEN), clean(env.TMDB_API_KEY)].filter(Boolean);
  const readToken = creds.find((c) => c.includes('.'));
  const apiKey = creds.find((c) => !c.includes('.'));
  const region = env.TMDB_REGION || 'DK';
  const language = env.TMDB_LANGUAGE || 'en-US';
  const live = !!(apiKey || readToken);
  let providerIds = null; // key -> TMDB provider id
  let providerError = null; // why the last provider lookup failed

  async function tmdb(path, params = {}) {
    const url = new URL(TMDB + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const headers = { accept: 'application/json' };
    if (readToken) headers.authorization = `Bearer ${readToken}`;
    else url.searchParams.set('api_key', apiKey);
    const res = await fetchImpl(url, { headers });
    if (!res.ok) {
      const hint = res.status === 401 ? ' (TMDB rejected the key: check TMDB_READ_TOKEN / TMDB_API_KEY in .env)' : '';
      throw new Error(`TMDB ${path} failed with ${res.status}${hint}`);
    }
    return res.json();
  }

  async function resolveProviderIds() {
    if (providerIds) return providerIds;
    const ids = {};
    let ok = false;
    try {
      const { results = [] } = await tmdb('/watch/providers/movie', { watch_region: region, language });
      for (const p of PROVIDERS) {
        const hit = results.find((r) => p.match.test(r.provider_name.trim()));
        if (hit) ids[p.key] = hit.provider_id;
      }
      ok = true;
      providerError = null;
    } catch (e) {
      providerError = e;
      console.warn('[catalog] could not load provider list, using fallbacks:', e.message);
    }
    for (const p of PROVIDERS) if (!ids[p.key] && p.fallbackId) ids[p.key] = p.fallbackId;
    if (ok) providerIds = ids; // retry the lookup next time if it failed
    return ids;
  }

  const upsertMovie = db.prepare(`
    INSERT INTO movies (id, title, overview, poster_path, backdrop_path, release_date, vote_average, popularity, genres, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, overview=excluded.overview, poster_path=excluded.poster_path,
      backdrop_path=excluded.backdrop_path, release_date=excluded.release_date, vote_average=excluded.vote_average,
      popularity=excluded.popularity, genres=excluded.genres, updated_at=excluded.updated_at`);
  const linkProvider = db.prepare('INSERT OR IGNORE INTO movie_providers (movie_id, provider) VALUES (?, ?)');

  function storeMovies(movies) {
    tx(db, () => {
      for (const m of movies) {
        upsertMovie.run(m.id, m.title, m.overview || '', m.poster_path ?? null, m.backdrop_path ?? null,
          m.release_date || null, m.vote_average || 0, m.popularity || 0, JSON.stringify(m.genres || []));
        for (const p of m.providers) linkProvider.run(m.id, p);
      }
    });
  }

  function seedDemo() {
    const { n } = db.prepare('SELECT COUNT(*) n FROM movies WHERE id >= 9000000').get();
    if (n < DEMO_MOVIES.length) storeMovies(DEMO_MOVIES);
  }

  /** Fetch the next uncached (or stale) discover page for a provider. Returns number of movies added. */
  async function fetchNextPage(providerKey) {
    const ids = await resolveProviderIds();
    const pid = ids[providerKey];
    if (!pid) {
      if (providerError) throw providerError;
      return 0;
    }
    const pages = db.prepare(`SELECT page, total_pages, fetched_at > datetime('now', ?) fresh
      FROM catalog_pages WHERE provider = ? ORDER BY page`).all(`-${PAGE_TTL_HOURS} hours`, providerKey);
    const stale = pages.find((p) => !p.fresh);
    let page = stale ? stale.page : pages.length + 1;
    const total = pages.length ? pages[0].total_pages : Infinity;
    if (!stale && page > Math.min(total, 500)) return 0;

    const data = await tmdb('/discover/movie', {
      watch_region: region,
      with_watch_providers: pid,
      with_watch_monetization_types: 'flatrate|free|ads',
      sort_by: 'popularity.desc',
      include_adult: 'false',
      language,
      page,
    });
    const movies = (data.results || []).map((r) => ({
      id: r.id,
      title: r.title,
      overview: r.overview,
      poster_path: r.poster_path,
      backdrop_path: r.backdrop_path,
      release_date: r.release_date,
      vote_average: r.vote_average,
      popularity: r.popularity,
      genres: (r.genre_ids || []).map((g) => GENRES[g]).filter(Boolean),
      providers: [providerKey],
    }));
    storeMovies(movies);
    db.prepare(`INSERT INTO catalog_pages (provider, page, total_pages) VALUES (?, ?, ?)
      ON CONFLICT(provider, page) DO UPDATE SET total_pages=excluded.total_pages, fetched_at=datetime('now')`)
      .run(providerKey, page, data.total_pages || 1);
    return movies.length;
  }

  /**
   * Make sure the catalog has at least `want` movies on `providers` that the
   * user hasn't swiped yet. In demo mode this is a no-op.
   */
  async function ensureAvailable(providers, countUnswiped, want) {
    if (!live) return;
    let lastError = null;
    for (let round = 0; round < 3 && countUnswiped() < want; round++) {
      let added = 0;
      for (const p of providers) {
        try {
          added += await fetchNextPage(p);
        } catch (e) {
          lastError = e;
          console.warn(`[catalog] fetch failed for ${p}:`, e.message);
        }
      }
      if (!added) break;
    }
    // Only surface the error when there is nothing at all to show.
    if (lastError && countUnswiped() === 0) {
      const err = new Error(`Couldn't load movies from TMDB. ${lastError.message}`);
      err.status = 502;
      err.expose = true;
      throw err;
    }
  }

  if (!live) seedDemo();

  return { live, ensureAvailable, region };
}
