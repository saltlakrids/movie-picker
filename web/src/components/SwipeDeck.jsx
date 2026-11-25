import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Poster, ProviderBadge, MovieMeta } from './Poster.jsx';

const THRESHOLD = 110;

export default function SwipeDeck({ partyId, onMatch }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState('');
  const [last, setLast] = useState(null); // last swiped movie, for undo
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [leaving, setLeaving] = useState(null); // { dir }
  const [details, setDetails] = useState(false);
  const start = useRef(null);
  const fetching = useRef(false);
  const swiped = useRef(new Set());

  const fetchMore = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const { movies } = await api(`/parties/${partyId}/deck?limit=20`);
      setQueue((q) => {
        const have = new Set(q.map((m) => m.id));
        const add = movies.filter((m) => !have.has(m.id) && !swiped.current.has(m.id));
        if (!add.length && q.length === 0) setExhausted(true);
        return [...q, ...add];
      });
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, [partyId]);

  useEffect(() => { fetchMore(); }, [fetchMore]);
  useEffect(() => {
    if (!loading && queue.length <= 5 && !exhausted) fetchMore();
  }, [queue.length, loading, exhausted, fetchMore]);

  const top = queue[0];

  const commit = useCallback(async (movie, liked) => {
    swiped.current.add(movie.id);
    setQueue((q) => q.filter((m) => m.id !== movie.id));
    setLast({ movie, liked });
    setDetails(false);
    try {
      const { match } = await api(`/parties/${partyId}/swipes`, { method: 'POST', body: { movieId: movie.id, liked } });
      if (match) onMatch(match);
    } catch (e) {
      setError(e.message);
    }
  }, [partyId, onMatch]);

  const swipe = useCallback((liked) => {
    if (!top || leaving) return;
    setLeaving({ dir: liked ? 1 : -1 });
    setTimeout(() => {
      setLeaving(null);
      setDrag({ x: 0, y: 0, active: false });
      commit(top, liked);
    }, 260);
  }, [top, leaving, commit]);

  async function undo() {
    if (!last) return;
    const { movie } = last;
    setLast(null);
    swiped.current.delete(movie.id);
    await api(`/parties/${partyId}/swipes/${movie.id}`, { method: 'DELETE' }).catch(() => {});
    setExhausted(false);
    setQueue((q) => [movie, ...q.filter((m) => m.id !== movie.id)]);
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea')) return;
      if (e.key === 'ArrowRight') swipe(true);
      else if (e.key === 'ArrowLeft') swipe(false);
      else if (e.key === 'ArrowUp' || e.key === ' ') { e.preventDefault(); setDetails((d) => !d); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [swipe]);

  function onPointerDown(e) {
    if (leaving || e.button > 0) return;
    start.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: 0, y: 0, active: true });
  }
  function onPointerMove(e) {
    if (!start.current) return;
    const x = e.clientX - start.current.x;
    const y = e.clientY - start.current.y;
    if (Math.abs(x) + Math.abs(y) > 6) start.current.moved = true;
    setDrag({ x, y, active: true });
  }
  function onPointerUp() {
    if (!start.current) return;
    const { moved } = start.current;
    start.current = null;
    if (Math.abs(drag.x) > THRESHOLD) {
      swipe(drag.x > 0);
      setDrag((d) => ({ ...d, active: false }));
    } else {
      setDrag({ x: 0, y: 0, active: false });
      if (!moved) setDetails((d) => !d);
    }
  }

  if (loading) return <div className="deck-empty"><div className="spinner" /> Finding popular movies…</div>;

  if (!top) {
    return (
      <div className="deck-empty">
        <div className="big-emoji">{error ? '⚠️' : '🎞️'}</div>
        <h3>{error ? "Couldn't load movies" : exhausted ? "You've swiped through everything" : 'Loading more…'}</h3>
        {error && <p className="error">{error}</p>}
        {error && <button className="btn primary" onClick={() => { setLoading(true); fetchMore(); }}>Try again</button>}
        {!error && exhausted && <p className="muted">Add more streaming services in party settings, or check back later for new titles.</p>}
        {last && <button className="btn" onClick={undo}>↶ Undo last swipe</button>}
      </div>
    );
  }

  const x = leaving ? leaving.dir * (window.innerWidth + 200) : drag.x;
  const y = leaving ? drag.y : drag.y * 0.3;
  const rot = x / 18;
  const likeOpacity = Math.max(0, Math.min(1, x / THRESHOLD));
  const nopeOpacity = Math.max(0, Math.min(1, -x / THRESHOLD));

  return (
    <div className="deck-wrap">
      <div className="deck">
        {queue.slice(1, 3).reverse().map((m, i, arr) => (
          <div key={m.id} className="swipe-card behind" style={{ transform: `scale(${1 - (arr.length - i) * 0.04}) translateY(${(arr.length - i) * 14}px)` }}>
            <Poster movie={m} />
          </div>
        ))}
        <div
          key={top.id}
          className={`swipe-card top ${drag.active ? 'dragging' : ''}`}
          style={{ transform: `translate(${x}px, ${y}px) rotate(${rot}deg)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <Poster movie={top} />
          <div className="stamp like" style={{ opacity: leaving?.dir === 1 ? 1 : likeOpacity }}>LIKE</div>
          <div className="stamp nope" style={{ opacity: leaving?.dir === -1 ? 1 : nopeOpacity }}>NOPE</div>
          {top.othersLiked > 0 && <div className="hint-liked">💘 Someone in your party liked this</div>}
          <div className={`card-info ${details ? 'open' : ''}`}>
            <h3>{top.title}</h3>
            <MovieMeta movie={top} />
            <div className="badges">{top.providers.map((k) => <ProviderBadge key={k} k={k} />)}</div>
            {details ? <p className="overview">{top.overview || 'No description available.'}</p>
              : <p className="tap-hint">Tap for details</p>}
          </div>
        </div>
      </div>

      <div className="deck-actions">
        <button className="round undo" onClick={undo} disabled={!last} aria-label="Undo last swipe" title="Undo">↶</button>
        <button className="round nope" onClick={() => swipe(false)} aria-label="Nope" title="Nope (←)">✕</button>
        <button className="round info" onClick={() => setDetails((d) => !d)} aria-label="Details" title="Details (↑)">i</button>
        <button className="round like" onClick={() => swipe(true)} aria-label="Like" title="Like (→)">♥</button>
      </div>
      {error && <p className="error center">{error}</p>}
    </div>
  );
}
