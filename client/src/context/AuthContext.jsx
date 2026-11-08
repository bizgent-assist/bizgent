import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api/index.js';
import { onSessionExpired } from '../services/api/http.js';

const AuthContext = createContext(null);
const ACTIVE_KEY = 'bz_active_business';

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, businesses: [], error: null });
  const [activeId, setActiveId] = useState(() => {
    try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
  });
  const navigate = useNavigate();

  const apply = useCallback((data) => setState({ status: 'authenticated', user: data.user, businesses: data.businesses || [], error: null }), []);

  const refresh = useCallback(async () => {
    try {
      apply(await api.auth.me());
    } catch (error) {
      if (error.status === 401) setState({ status: 'anonymous', user: null, businesses: [], error: null });
      else setState((s) => ({ ...s, status: s.user ? 'authenticated' : 'error', error }));
    }
  }, [apply]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => onSessionExpired(() => {
    setState({ status: 'anonymous', user: null, businesses: [], error: null });
    navigate('/login?expired=1', { replace: true });
  }), [navigate]);

  const value = useMemo(() => {
    const business = state.businesses.find((b) => b._id === activeId) || state.businesses[0] || null;
    return {
      ...state,
      business,
      setActiveBusiness: (id) => { setActiveId(id); try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* ignore */ } },
      refresh,
      login: async (body) => apply(await api.auth.login(body)),
      register: async (body) => apply(await api.auth.register(body)),
      logout: async () => {
        try { await api.auth.logout(); } finally {
          setState({ status: 'anonymous', user: null, businesses: [], error: null });
          navigate('/login', { replace: true });
        }
      },
      updateUser: (user) => setState((s) => ({ ...s, user: { ...s.user, ...user } })),
      updateBusiness: (b) => setState((s) => ({ ...s, businesses: s.businesses.map((x) => (x._id === b._id ? b : x)) })),
    };
  }, [state, activeId, refresh, apply, navigate]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
