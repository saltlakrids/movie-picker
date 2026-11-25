import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { navigate, usePath } from './router.jsx';
import Auth from './pages/Auth.jsx';
import Home from './pages/Home.jsx';
import Join from './pages/Join.jsx';
import Party from './pages/Party.jsx';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export default function App() {
  const path = usePath();
  const [user, setUser] = useState(undefined); // undefined = loading
  const [config, setConfig] = useState(null);

  useEffect(() => {
    api('/config').then(setConfig).catch(() => setConfig({ providers: [], live: false }));
    api('/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  if (user === undefined || !config) return <div className="splash">🍿</div>;

  const ctx = {
    user,
    config,
    setUser,
    providerInfo: (key) => config.providers.find((p) => p.key === key) || { key, name: key, color: '#444' },
    logout: async () => {
      await api('/auth/logout', { method: 'POST' });
      setUser(null);
      navigate('/');
    },
  };

  let page;
  const join = path.match(/^\/join\/([A-Za-z0-9]+)/);
  const party = path.match(/^\/party\/(\d+)(?:\/(\w+))?/);
  if (!user) page = <Auth next={join ? path : '/'} inviteCode={join?.[1]} />;
  else if (join) page = <Join code={join[1]} />;
  else if (party) page = <Party key={party[1]} id={Number(party[1])} tab={party[2] || 'swipe'} />;
  else page = <Home />;

  return <AppCtx.Provider value={ctx}>{page}</AppCtx.Provider>;
}
