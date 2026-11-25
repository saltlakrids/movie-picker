import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { Poster, ProviderBadge, MovieMeta } from './Poster.jsx';
import RateDialog from './RateDialog.jsx';

export default function Watchlist({ partyId, refreshKey }) {
  const { user } = useApp();
  const [items, setItems] = useState(null);
  const [rating, setRating] = useState(null);
  const load = useCallback(() => api(`/parties/${partyId}/watchlist`).then((d) => setItems(d.watchlist)), [partyId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function remove(entry) {
    if (!confirm(`Remove “${entry.movie.title}” from the watchlist?`)) return;
    await api(`/parties/${partyId}/watchlist/${entry.movie.id}`, { method: 'DELETE' });
    load();
  }

  if (!items) return <p className="muted center">Loading…</p>;
  if (!items.length) {
    return (
      <div className="deck-empty">
        <div className="big-emoji">🎬</div>
        <h3>Your watchlist is empty</h3>
        <p className="muted">Add movies you matched on, then rate them once you've watched.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="list">
        {items.map((e) => (
          <li key={e.movie.id} className="card list-item">
            <Poster movie={e.movie} className="thumb" />
            <div className="list-body">
              <h3>{e.movie.title}</h3>
              <MovieMeta movie={e.movie} />
              <div className="badges">{e.movie.providers.map((k) => <ProviderBadge key={k} k={k} />)}</div>
              <div className="row">
                <button className="btn primary small" onClick={() => setRating(e)}>Watched it — rate</button>
                <button className="btn ghost small" onClick={() => remove(e)}>Remove</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {rating && (
        <RateDialog partyId={partyId} entry={rating} myRating={rating.ratings.find((r) => r.user.id === user.id)}
          onClose={() => setRating(null)} onSaved={() => { setRating(null); load(); }} />
      )}
    </>
  );
}
