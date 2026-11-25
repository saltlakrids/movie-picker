import { useState } from 'react';
import { useApp } from '../App.jsx';

const GRADIENTS = [
  ['#ff5f6d', '#ffc371'], ['#2193b0', '#6dd5ed'], ['#cc2b5e', '#753a88'], ['#42275a', '#734b6d'],
  ['#de6262', '#ffb88c'], ['#06beb6', '#48b1bf'], ['#eb3349', '#f45c43'], ['#614385', '#516395'],
  ['#02aab0', '#00cdac'], ['#da22ff', '#9733ee'], ['#ff512f', '#dd2476'], ['#1d976c', '#93f9b9'],
];

/** Movie poster, falling back to a generated title card when there is no image. */
export function Poster({ movie, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (movie.poster && !failed) {
    return <img className={`poster ${className}`} src={movie.poster} alt={movie.title} draggable={false} onError={() => setFailed(true)} />;
  }
  const [a, b] = GRADIENTS[movie.id % GRADIENTS.length];
  return (
    <div className={`poster poster-fallback ${className}`} style={{ background: `linear-gradient(160deg, ${a}, ${b})` }}>
      <span>{movie.title}</span>
    </div>
  );
}

export function ProviderBadge({ k }) {
  const { providerInfo } = useApp();
  const p = providerInfo(k);
  return <span className="provider-badge" style={{ '--c': p.color }}>{p.name}</span>;
}

export function MovieMeta({ movie }) {
  return (
    <div className="meta">
      {movie.year && <span>{movie.year}</span>}
      {movie.voteAverage > 0 && <span>★ {movie.voteAverage.toFixed(1)}</span>}
      {movie.genres.slice(0, 3).map((g) => <span key={g}>{g}</span>)}
    </div>
  );
}
