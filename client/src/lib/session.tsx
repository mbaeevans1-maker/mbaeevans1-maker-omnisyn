import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, errorMessage, type SessionResponse, type SessionUser, type TenantSummary, type SubscriptionSummary, type PlatformStatus } from './api';

type SessionState = {
  user: SessionUser | null;
  tenant: TenantSummary | null;
  subscription: SubscriptionSummary | null;
  platform: PlatformStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<SessionResponse | null>;
  login: (email: string, password: string) => Promise<SessionUser>;
  signup: (payload: Record<string, unknown>) => Promise<SessionUser>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((data: SessionResponse | null) => {
    setUser(data?.user ?? null);
    setTenant(data?.tenant ?? null);
    setSubscription(data?.subscription ?? null);
    setPlatform(data?.platform ?? null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<SessionResponse>('/auth/session');
      apply(data);
      setError(null);
      return data;
    } catch (err) {
      apply(null);
      setError(errorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<SessionResponse & { user: SessionUser }>('/auth/login', { email, password });
      apply(data);
      return data.user;
    },
    [apply],
  );

  const signup = useCallback(
    async (payload: Record<string, unknown>) => {
      const data = await api.post<SessionResponse & { user: SessionUser }>('/auth/signup', payload);
      apply(data);
      return data.user;
    },
    [apply],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      apply(null);
    }
  }, [apply]);

  const can = useCallback(
    (permission: string) => {
      if (!user) return false;
      if (user.role === 'platform_admin') return true;
      if (Array.isArray(user.permissions) && user.permissions.length) return user.permissions.includes(permission);
      return true;
    },
    [user],
  );

  const value = useMemo<SessionState>(
    () => ({ user, tenant, subscription, platform, loading, error, refresh, login, signup, logout, can }),
    [user, tenant, subscription, platform, loading, error, refresh, login, signup, logout, can],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
