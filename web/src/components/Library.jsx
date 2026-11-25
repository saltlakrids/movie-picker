import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { Poster, MovieMeta } from './Poster.jsx';
import RateDialog, { scoreColor } from './RateDialog.jsx';

const FILTERS = [
  ['all', 'All'],
  ['loved', 'We loved'],
  ['disliked', 'We disliked'],
  ['split', 'Split opinions'],
  ['todo', 'Needs my rating'],
];

export default function Library({ partyId, members }) {
  const { user } = useApp();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [rating, setRating] = useState(null);
  const load = useCallback(() => api(`/parties/${partyId}/library`).then((d) => setItems(d.library)), [partyId]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    if (!items) return [];
    const mine = (e) => e.ratings.find((r) => r.user.id === user.id);
    const spread = (e) => {
      const s = e.ratings.map((r) => r.score).filter((x) => x != null);
      return s.length > 1 ? Math.max(...s) - Math.min(...s) : 0;
    };
    let list = items.filter((e) => {
      if (filter === 'loved') return e.average != null && e.average >= 7;
      if (filter === 'disliked') return e.average != null && e.average <= 4.5;
      if (filter === 'split') return spread(e) >= 4;
      if (filter === 'todo') return !mine(e)?.rated;
      return true;
    });
    if (sort === 'score') list = [...list].sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
    return list;
  }, [items, filter, sort, user.id]);

  if (!items) return <p className="muted center">Loading…</p>;
  if (!items.length) {
    return (
      <div className="deck-empty">
        <div className="big-emoji">⭐</div>
        <h3>Nothing watched yet</h3>
        <p className="muted">Rate a movie from your watchlist and it lands in your shared library.</p>
      </div>
    );
  }

  return (
    <>
      <div className="toolbar">
        <div className="filters">
          {FILTERS.map(([k, label]) => (
            <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="recent">Recently watched</option>
          <option value="score">Highest rated</option>
        </select>
      </div>

      <LibraryStats items={items} members={members} />

      {shown.length === 0 && <p className="muted center">Nothing here.</p>}
      <ul className="list">
        {shown.map((e) => {
          const mine = e.ratings.find((r) => r.user.id === user.id);
          return (
            <li key={e.movie.id} className="card list-item">
              <Poster movie={e.movie} className="thumb" />
              <div className="list-body">
                <div className="title-row">
                  <h3>{e.movie.title}</h3>
                  {e.average != null && <span className="avg" style={{ '--sc': scoreColor(e.average) }}>{e.average.toFixed(1)}</span>}
                </div>
                <MovieMeta movie={e.movie} />
                <div className="ratings">
                  {e.ratings.map((r) => (
                    <div key={r.user.id} className="rating-row">
                      <span className="who">{r.user.id === user.id ? 'You' : r.user.displayName}</span>
                      {r.score != null ? (
                        <>
                          <span className="score-pill" style={{ '--sc': scoreColor(r.score) }}>{r.score}/10</span>
                          {r.comment && <span className="comment">“{r.comment}”</span>}
                        </>
                      ) : r.rated ? (
                        <span className="muted small">🔒 rated — rate it yourself to reveal</span>
                      ) : (
                        <span className="muted small">not rated yet</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="row">
                  <button className="btn small" onClick={() => setRating(e)}>{mine?.rated ? 'Edit my rating' : 'Rate it'}</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {rating && (
        <RateDialog partyId={partyId} entry={rating} myRating={rating.ratings.find((r) => r.user.id === user.id)}
          onClose={() => setRating(null)} onSaved={() => { setRating(null); load(); }} />
      )}
    </>
  );
}

function LibraryStats({ items, members }) {
  const rated = items.filter((e) => e.average != null);
  if (!rated.length) return null;
  const avg = (rated.reduce((a, e) => a + e.average, 0) / rated.length).toFixed(1);
  const best = rated.reduce((a, e) => (e.average > a.average ? e : a));
  const perMember = members.map((m) => {
    const s = rated.map((e) => e.ratings.find((r) => r.user.id === m.id)?.score).filter((x) => x != null);
    return { name: m.displayName, avg: s.length ? (s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) : '–' };
  });
  return (
    <div className="stats">
      <div className="stat"><span className="stat-n">{items.length}</span><span className="muted small">watched together</span></div>
      <div className="stat"><span className="stat-n">{avg}</span><span className="muted small">avg shared score</span></div>
      <div className="stat wide"><span className="stat-t">{best.movie.title}</span><span className="muted small">top pick ({best.average.toFixed(1)})</span></div>
      {perMember.map((p) => (
        <div className="stat" key={p.name}><span className="stat-n">{p.avg}</span><span className="muted small">{p.name}'s avg</span></div>
      ))}
    </div>
  );
}
