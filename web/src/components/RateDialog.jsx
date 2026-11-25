import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Poster } from './Poster.jsx';

export default function RateDialog({ partyId, entry, myRating, onClose, onSaved }) {
  const [score, setScore] = useState(myRating?.score || 0);
  const [comment, setComment] = useState(myRating?.comment || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    setBusy(true);
    try {
      await api(`/parties/${partyId}/ratings/${entry.movie.id}`, { method: 'PUT', body: { score, comment } });
      onSaved();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet card" role="dialog" aria-modal="true" aria-label={`Rate ${entry.movie.title}`} onClick={(e) => e.stopPropagation()}>
        <div className="rate-head">
          <Poster movie={entry.movie} className="thumb" />
          <div>
            <h2>{entry.movie.title}</h2>
            <p className="muted small">Your score is hidden from the others until they've rated it too.</p>
          </div>
        </div>
        <div className="score-picker" role="radiogroup" aria-label="Score from 1 to 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} role="radio" aria-checked={score === n} className={`score ${score >= n ? 'on' : ''} ${score === n ? 'sel' : ''}`}
              style={{ '--h': (n - 1) * 13 }} onClick={() => setScore(n)}>{n}</button>
          ))}
        </div>
        <div className="score-label">{score ? scoreLabel(score) : 'Pick a score'}</div>
        <label className="form">
          <span className="label">Thoughts (optional)</span>
          <textarea rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="That ending though…" />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!score || busy} onClick={save}>Save rating</button>
        </div>
      </div>
    </div>
  );
}

export function scoreLabel(s) {
  if (s >= 9) return 'Masterpiece';
  if (s >= 7) return 'Loved it';
  if (s >= 5) return "It's fine";
  if (s >= 3) return 'Not for me';
  return 'Hated it';
}

export function scoreColor(s) {
  return `hsl(${(s - 1) * 13}, 75%, 55%)`;
}
