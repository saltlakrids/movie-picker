import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { navigate, Link } from '../router.jsx';
import ProviderPicker from '../components/ProviderPicker.jsx';
import { ProviderBadge } from '../components/Poster.jsx';

export default function Home() {
  const { user, config, logout } = useApp();
  const [parties, setParties] = useState(null);
  const [name, setName] = useState('');
  const [providers, setProviders] = useState(config.providers.filter((p) => p.default).map((p) => p.key));
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('/parties').then((d) => setParties(d.parties)).catch((e) => setError(e.message));
  }, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      const { party } = await api('/parties', { method: 'POST', body: { name: name || 'Movie night', providers } });
      navigate(`/party/${party.id}/swipe`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function join(e) {
    e.preventDefault();
    setError('');
    try {
      const { party } = await api('/parties/join', { method: 'POST', body: { code } });
      navigate(`/party/${party.id}/swipe`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="page">
      <header className="topbar">
        <span className="logo">🍿 Movie Picker</span>
        <span className="spacer" />
        <span className="muted small">Hi, {user.displayName}</span>
        <button className="btn ghost small" onClick={logout}>Log out</button>
      </header>

      {!config.live && (
        <div className="notice"><span>Demo catalog: running without a TMDB API key, so you're swiping a small built-in list.
          Add <code>TMDB_API_KEY</code> to get the live popular catalog for Danish streaming services.</span></div>
      )}
      {error && <p className="error">{error}</p>}

      <section>
        <h2>Your parties</h2>
        {parties === null ? <p className="muted">Loading…</p> : parties.length === 0 ? (
          <p className="muted">No parties yet. Start one and invite your movie buddy.</p>
        ) : (
          <ul className="party-list">
            {parties.map((p) => (
              <li key={p.id}>
                <Link to={`/party/${p.id}/swipe`} className="card party-item">
                  <div>
                    <strong>{p.name}</strong>
                    <div className="muted small">
                      {p.members.map((m) => m.displayName).join(' & ')}
                      {p.members.length < p.maxMembers && ' · waiting for someone to join'}
                    </div>
                  </div>
                  <div className="badges">{p.providers.map((k) => <ProviderBadge key={k} k={k} />)}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid-2">
        <form className="card form" onSubmit={create}>
          <h2>New party</h2>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Movie night" maxLength={60} />
          </label>
          <div>
            <div className="label">Streaming services you have</div>
            <ProviderPicker value={providers} onChange={setProviders} />
          </div>
          <button className="btn primary" disabled={!providers.length}>Create &amp; get invite link</button>
        </form>

        <form className="card form" onSubmit={join}>
          <h2>Join with a code</h2>
          <label>
            Invite code
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123"
              maxLength={6} className="code-input" required />
          </label>
          <button className="btn">Join party</button>
        </form>
      </div>
    </main>
  );
}
