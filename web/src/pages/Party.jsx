import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { Link, navigate } from '../router.jsx';
import SwipeDeck from '../components/SwipeDeck.jsx';
import MatchModal from '../components/MatchModal.jsx';
import Matches from '../components/Matches.jsx';
import Watchlist from '../components/Watchlist.jsx';
import Library from '../components/Library.jsx';
import ProviderPicker from '../components/ProviderPicker.jsx';

const TABS = [
  ['swipe', 'Swipe', '🔥'],
  ['matches', 'Matches', '💞'],
  ['watchlist', 'Watchlist', '🎬'],
  ['library', 'Library', '⭐'],
];

function loadSeen(id) {
  try {
    return new Set(JSON.parse(localStorage.getItem(`mp-seen-${id}`) || '[]'));
  } catch {
    return new Set();
  }
}
function saveSeen(id, set) {
  try {
    localStorage.setItem(`mp-seen-${id}`, JSON.stringify([...set]));
  } catch { /* storage unavailable */ }
}

export default function Party({ id, tab }) {
  const { user } = useApp();
  const [party, setParty] = useState(null);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState([]);
  const [modalQueue, setModalQueue] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const seen = useRef(loadSeen(id));

  const loadParty = useCallback(() => api(`/parties/${id}`).then((d) => setParty(d.party)), [id]);

  const pollMatches = useCallback(async () => {
    const { matches } = await api(`/parties/${id}/matches`);
    setMatches(matches);
    const fresh = matches.filter((m) => !seen.current.has(m.id) && !m.inWatchlist);
    if (fresh.length) {
      fresh.forEach((m) => seen.current.add(m.id));
      saveSeen(id, seen.current);
      setModalQueue((q) => [...q, ...fresh.filter((m) => !q.some((x) => x.id === m.id))]);
    }
  }, [id]);

  useEffect(() => {
    loadParty().catch((e) => setError(e.message));
  }, [loadParty]);

  useEffect(() => {
    if (!party) return;
    pollMatches().catch(() => {});
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') {
        pollMatches().catch(() => {});
        if (party.members.length < party.maxMembers) loadParty().catch(() => {});
      }
    }, 5000);
    return () => clearInterval(t);
  }, [party, pollMatches, loadParty]);

  const onMatch = (movie) => {
    seen.current.add(movie.id);
    saveSeen(id, seen.current);
    setModalQueue((q) => [...q, movie]);
    pollMatches().catch(() => {});
  };

  async function addToWatchlist(movie) {
    await api(`/parties/${id}/watchlist`, { method: 'POST', body: { movieId: movie.id } });
    await pollMatches();
    setRefreshKey((k) => k + 1);
  }

  if (error) {
    return (
      <main className="page">
        <p className="error">{error}</p>
        <Link to="/" className="btn">Back</Link>
      </main>
    );
  }
  if (!party) return <div className="splash">🍿</div>;

  const waiting = party.members.length < 2;
  const others = party.members.filter((m) => m.id !== user.id);
  const newMatches = matches.filter((m) => !m.inWatchlist).length;

  return (
    <main className="page party">
      <header className="topbar">
        <Link to="/" className="btn ghost small" aria-label="Back to parties">←</Link>
        <div className="party-title">
          <strong>{party.name}</strong>
          <span className="muted small">
            {waiting ? 'Waiting for someone to join' : `with ${others.map((m) => m.displayName).join(' & ')}`}
          </span>
        </div>
        <span className="spacer" />
        <button className="btn small" onClick={() => setShowInvite(true)}>Invite</button>
        <button className="btn ghost small" onClick={() => setShowSettings(true)} aria-label="Party settings">⚙︎</button>
      </header>

      <nav className="tabs">
        {TABS.map(([key, label, icon]) => (
          <Link key={key} to={`/party/${id}/${key}`} className={`tab ${tab === key ? 'active' : ''}`}>
            <span aria-hidden>{icon}</span> {label}
            {key === 'matches' && newMatches > 0 && <span className="count">{newMatches}</span>}
          </Link>
        ))}
      </nav>

      {waiting && tab === 'swipe' && (
        <div className="notice">
          Matches need everyone. Send your invite link so your buddy can join — you can start swiping meanwhile.
          <button className="btn small" onClick={() => setShowInvite(true)}>Share invite</button>
        </div>
      )}

      <section className="tab-body">
        {tab === 'swipe' && <SwipeDeck partyId={id} providers={party.providers} onMatch={onMatch} key={party.providers.join()} />}
        {tab === 'matches' && <Matches matches={matches} onAdd={addToWatchlist} />}
        {tab === 'watchlist' && <Watchlist partyId={id} refreshKey={refreshKey} />}
        {tab === 'library' && <Library partyId={id} members={party.members} />}
      </section>

      {modalQueue[0] && (
        <MatchModal
          movie={modalQueue[0]}
          names={party.members.map((m) => m.displayName)}
          onAdd={async () => {
            await addToWatchlist(modalQueue[0]);
            setModalQueue((q) => q.slice(1));
          }}
          onClose={() => setModalQueue((q) => q.slice(1))}
        />
      )}

      {showInvite && <InviteSheet party={party} onClose={() => setShowInvite(false)} />}
      {showSettings && (
        <SettingsSheet party={party} onClose={() => setShowSettings(false)}
          onSaved={(p) => { setParty(p); setShowSettings(false); }} />
      )}
    </main>
  );
}

function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet card" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InviteSheet({ party, onClose }) {
  const link = `${location.origin}/join/${party.inviteCode}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch { /* clipboard blocked */ }
  };
  const share = () => navigator.share?.({ title: 'Movie Picker', text: `Join my movie party “${party.name}”`, url: link });
  return (
    <Sheet title="Invite to party" onClose={onClose}>
      <p className="muted">Share this link, or have them enter the code on their home screen.</p>
      <div className="invite-code">{party.inviteCode}</div>
      <div className="copy-row">
        <input readOnly value={link} onFocus={(e) => e.target.select()} />
        <button className="btn" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
      {navigator.share && <button className="btn primary" onClick={share}>Share…</button>}
      <p className="muted small">{party.members.length} / {party.maxMembers} members: {party.members.map((m) => m.displayName).join(', ')}</p>
    </Sheet>
  );
}

function SettingsSheet({ party, onClose, onSaved }) {
  const [name, setName] = useState(party.name);
  const [providers, setProviders] = useState(party.providers);
  const [error, setError] = useState('');
  async function save() {
    try {
      const { party: p } = await api(`/parties/${party.id}`, { method: 'PATCH', body: { name, providers } });
      onSaved(p);
    } catch (e) {
      setError(e.message);
    }
  }
  async function leave() {
    if (!confirm(`Leave “${party.name}”? Your swipes and ratings stay with the party.`)) return;
    await api(`/parties/${party.id}/members/me`, { method: 'DELETE' });
    navigate('/');
  }
  return (
    <Sheet title="Party settings" onClose={onClose}>
      <div className="form">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </label>
        <div>
          <div className="label">Streaming services</div>
          <ProviderPicker value={providers} onChange={setProviders} />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" onClick={save} disabled={!providers.length}>Save</button>
        <button className="btn danger ghost" onClick={leave}>Leave party</button>
      </div>
    </Sheet>
  );
}
