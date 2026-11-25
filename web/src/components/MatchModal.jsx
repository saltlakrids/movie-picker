import { useState } from 'react';
import { Poster, ProviderBadge, MovieMeta } from './Poster.jsx';

export default function MatchModal({ movie, names, onAdd, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="overlay match-overlay" onClick={onClose}>
      <div className="match" role="dialog" aria-modal="true" aria-label="It's a match" onClick={(e) => e.stopPropagation()}>
        <div className="confetti" aria-hidden>{'🎉🍿✨🎬💞'.repeat(3)}</div>
        <h2 className="match-title">It's a match!</h2>
        <p className="muted">{names.length === 2 ? `${names[0]} & ${names[1]} both` : `${names.join(', ')} all`} want to watch</p>
        <Poster movie={movie} className="match-poster" />
        <h3>{movie.title}</h3>
        <MovieMeta movie={movie} />
        <div className="badges center">{movie.providers.map((k) => <ProviderBadge key={k} k={k} />)}</div>
        <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); try { await onAdd(); } finally { setBusy(false); } }}>
          + Add to watchlist
        </button>
        <button className="btn ghost" onClick={onClose}>Keep swiping</button>
      </div>
    </div>
  );
}
