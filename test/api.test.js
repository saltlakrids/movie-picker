import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDb } from '../server/db.js';
import { createCatalog } from '../server/catalog.js';
import { createApp } from '../server/app.js';

async function startServer(env = {}, fetchImpl) {
  const db = openDb(':memory:');
  const catalog = createCatalog(db, env, fetchImpl);
  const app = createApp({ db, catalog });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, db, close: () => server.close() };
}

// Throwaway credentials for in-memory test users, generated per run.
const pw = Object.fromEntries(['alice', 'bob', 'carol', 'dora', 'erin', 'finn'].map((u) => [u, randomUUID()]));

/** Sign up or log in `c` as `username` (case-insensitive) with that user's generated password, or `pass` if given. */
function authAs(c, kind, username, { pass, displayName } = {}) {
  const password = pass ?? pw[username.toLowerCase()];
  return c('POST', `/api/auth/${kind}`, { username, password, displayName });
}

function client(base) {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
}

test('full flow: register, party, swipe, match, watchlist, rate, library', async () => {
  const { base, close } = await startServer();
  try {
    const alice = client(base);
    const bob = client(base);

    assert.equal((await alice('GET', '/api/me')).status, 401);
    assert.equal((await authAs(alice, 'register', 'alice', { displayName: 'Alice' })).status, 201);
    assert.equal((await authAs(bob, 'register', 'bob')).status, 201);
    assert.equal((await authAs(bob, 'register', 'ALICE', { pass: pw.bob })).status, 409);

    const { body: { party } } = await alice('POST', '/api/parties', { name: 'Date night', providers: ['netflix', 'dr', 'nope'] });
    assert.deepEqual(party.providers, ['netflix', 'dr']);
    const pid = party.id;

    // bob can't see it before joining
    assert.equal((await bob('GET', `/api/parties/${pid}`)).status, 404);
    const join = await bob('POST', '/api/parties/join', { code: party.inviteCode.toLowerCase() });
    assert.equal(join.status, 200);
    assert.equal(join.body.party.members.length, 2);

    // a third user can't join a 2-person party
    const carol = client(base);
    await authAs(carol, 'register', 'carol');
    assert.equal((await carol('POST', '/api/parties/join', { code: party.inviteCode })).status, 409);

    const deck = (await alice('GET', `/api/parties/${pid}/deck?limit=5`)).body.movies;
    assert.equal(deck.length, 5);
    for (const m of deck) assert.ok(m.providers.some((p) => ['netflix', 'dr'].includes(p)));

    const [m1, m2] = deck;
    assert.equal((await alice('POST', `/api/parties/${pid}/swipes`, { movieId: m1.id, liked: true })).body.match, null);
    await alice('POST', `/api/parties/${pid}/swipes`, { movieId: m2.id, liked: false });

    // bob's deck puts alice's liked movie first
    const bobDeck = (await bob('GET', `/api/parties/${pid}/deck?limit=3`)).body.movies;
    assert.equal(bobDeck[0].id, m1.id);
    assert.equal(bobDeck[0].othersLiked, 1);

    const swipe = await bob('POST', `/api/parties/${pid}/swipes`, { movieId: m1.id, liked: true });
    assert.equal(swipe.body.match.id, m1.id);
    assert.equal((await bob('POST', `/api/parties/${pid}/swipes`, { movieId: m2.id, liked: true })).body.match, null);

    // swiped movies leave alice's deck
    const deck2 = (await alice('GET', `/api/parties/${pid}/deck?limit=50`)).body.movies;
    assert.ok(!deck2.some((m) => m.id === m1.id || m.id === m2.id));

    const matches = (await alice('GET', `/api/parties/${pid}/matches`)).body.matches;
    assert.deepEqual(matches.map((m) => m.id), [m1.id]);

    // only matches can be added
    assert.equal((await alice('POST', `/api/parties/${pid}/watchlist`, { movieId: m2.id })).status, 409);
    assert.equal((await alice('POST', `/api/parties/${pid}/watchlist`, { movieId: m1.id })).status, 201);
    assert.equal((await bob('GET', `/api/parties/${pid}/watchlist`)).body.watchlist.length, 1);

    // rating: bob can't see alice's score until he rates
    assert.equal((await alice('PUT', `/api/parties/${pid}/ratings/${m1.id}`, { score: 11 })).status, 400);
    await alice('PUT', `/api/parties/${pid}/ratings/${m1.id}`, { score: 9, comment: 'Loved it' });
    let lib = (await bob('GET', `/api/parties/${pid}/library`)).body.library;
    assert.equal(lib.length, 1);
    const aliceRating = lib[0].ratings.find((r) => r.user.username === 'alice');
    assert.equal(aliceRating.rated, true);
    assert.equal(aliceRating.score, null);
    assert.equal(lib[0].average, null);

    await bob('PUT', `/api/parties/${pid}/ratings/${m1.id}`, { score: 6 });
    lib = (await bob('GET', `/api/parties/${pid}/library`)).body.library;
    assert.deepEqual(lib[0].ratings.map((r) => r.score), [9, 6]);
    assert.equal(lib[0].ratings[0].comment, 'Loved it');
    assert.equal(lib[0].average, 7.5);
    assert.equal((await bob('GET', `/api/parties/${pid}/watchlist`)).body.watchlist.length, 0);

    // logout kills the session
    await alice('POST', '/api/auth/logout');
    assert.equal((await alice('GET', '/api/parties')).status, 401);
    assert.equal((await authAs(alice, 'login', 'alice', { pass: pw.bob })).status, 401);
    assert.equal((await authAs(alice, 'login', 'alice')).status, 200);
    assert.equal((await alice('GET', '/api/parties')).body.parties.length, 1);
  } finally {
    close();
  }
});

test('live mode pulls Danish catalog pages from TMDB per provider', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url.toString());
    const u = new URL(url);
    let body;
    if (u.pathname.endsWith('/watch/providers/movie')) {
      body = { results: [
        { provider_id: 8, provider_name: 'Netflix' },
        { provider_id: 999, provider_name: 'DR TV' },
        { provider_id: 1899, provider_name: 'HBO Max' },
      ] };
    } else {
      const prov = u.searchParams.get('with_watch_providers');
      const page = Number(u.searchParams.get('page'));
      body = {
        total_pages: 2,
        results: Array.from({ length: 20 }, (_, i) => ({
          id: Number(prov) * 1000 + page * 100 + i,
          title: `Movie ${prov}-${page}-${i}`,
          genre_ids: [35],
          popularity: 100 - i,
          poster_path: '/x.jpg',
          release_date: '2024-05-01',
          vote_average: 7.1,
        })),
      };
    }
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const { base, close } = await startServer({ TMDB_API_KEY: 'k' }, fakeFetch);
  try {
    const c = client(base);
    await authAs(c, 'register', 'dora');
    const { body: { party } } = await c('POST', '/api/parties', { providers: ['dr'] });
    const deck = (await c('GET', `/api/parties/${party.id}/deck?limit=20`)).body.movies;
    assert.equal(deck.length, 20);
    assert.ok(deck.every((m) => m.providers.includes('dr') && m.genres[0] === 'Comedy' && m.year === 2024));
    assert.ok(deck[0].poster.startsWith('https://image.tmdb.org/'));
    const discover = calls.filter((c) => c.includes('/discover/movie'));
    assert.ok(discover.every((c) => c.includes('watch_region=DK') && c.includes('with_watch_providers=999')));
    assert.equal(discover.length, 2); // wanted 40 unswiped -> fetched both pages
  } finally {
    close();
  }
});

test('a v3 API key pasted into TMDB_READ_TOKEN is sent as api_key', async () => {
  const seen = [];
  const fakeFetch = async (url, opts) => {
    seen.push({ url: new URL(url), auth: opts.headers.authorization });
    return new Response(JSON.stringify({ results: [], total_pages: 1 }), { status: 200 });
  };
  const { base, close } = await startServer({ TMDB_READ_TOKEN: ' Bearer abc123def456 ' }, fakeFetch);
  try {
    const c = client(base);
    await authAs(c, 'register', 'erin');
    const { body: { party } } = await c('POST', '/api/parties', { providers: ['netflix'] });
    await c('GET', `/api/parties/${party.id}/deck`);
    assert.ok(seen.length > 0);
    for (const s of seen) {
      assert.equal(s.url.searchParams.get('api_key'), 'abc123def456');
      assert.equal(s.auth, undefined);
    }
  } finally {
    close();
  }
});

test('a rejected TMDB key shows a clear error instead of an empty deck', async () => {
  const fakeFetch = async () => new Response('{"status_message":"Invalid API key"}', { status: 401 });
  const { base, close } = await startServer({ TMDB_READ_TOKEN: 'eyJ.bad.token' }, fakeFetch);
  try {
    const c = client(base);
    await authAs(c, 'register', 'finn');
    const { body: { party } } = await c('POST', '/api/parties', { providers: ['dr'] });
    const res = await c('GET', `/api/parties/${party.id}/deck`);
    assert.equal(res.status, 502);
    assert.match(res.body.error, /TMDB rejected the key/);
  } finally {
    close();
  }
});
