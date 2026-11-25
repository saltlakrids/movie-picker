import { useState } from 'react';
import { Poster, ProviderBadge, MovieMeta } from './Poster.jsx';

export default function Matches({ matches, onAdd }) {
  const [busy, setBusy] = useState(null);
  if (!matches.length) {
    return (
      <div className="deck-empty">
        <div className="big-emoji">💞</div>
        <h3>No matches yet</h3>
        <p className="muted">When everyone in the party swipes right on the same movie, it shows up here.</p>
      </div>
    );
  }
  return (
    <div className="movie-grid">
      {matches.map((m) => (
        <article key={m.id} className="card movie-tile">
          <Poster movie={m} />
          <div className="tile-body">
            <h3>{m.title}</h3>
            <MovieMeta movie={m} />
            <div className="badges">{m.providers.map((k) => <ProviderBadge key={k} k={k} />)}</div>
            {m.inWatchlist ? <span className="pill ok">On watchlist ✓</span> : (
              <button className="btn primary small" disabled={busy === m.id}
                onClick={async () => { setBusy(m.id); try { await onAdd(m); } finally { setBusy(null); } }}>
                + Watchlist
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
