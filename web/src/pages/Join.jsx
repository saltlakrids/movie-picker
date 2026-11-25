import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { navigate, Link } from '../router.jsx';

export default function Join({ code }) {
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/invites/${code}`)
      .then(({ invite }) => {
        if (invite.alreadyMember) navigate(`/party/${invite.partyId}/swipe`, { replace: true });
        else setInvite(invite);
      })
      .catch((e) => setError(e.message));
  }, [code]);

  async function join() {
    try {
      const { party } = await api('/parties/join', { method: 'POST', body: { code } });
      navigate(`/party/${party.id}/swipe`, { replace: true });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <main className="auth">
      <div className="card form center">
        {error ? (
          <>
            <p className="error">{error}</p>
            <Link to="/" className="btn">Go home</Link>
          </>
        ) : !invite ? <p className="muted">Loading invite…</p> : (
          <>
            <div className="brand-logo">🎟️</div>
            <h2>Join “{invite.name}”</h2>
            <p className="muted">with {invite.members.join(' & ')}</p>
            {invite.full ? <p className="error">This party is already full.</p> : (
              <button className="btn primary" onClick={join}>Join party</button>
            )}
            <Link to="/" className="btn ghost">Not now</Link>
          </>
        )}
      </div>
    </main>
  );
}
