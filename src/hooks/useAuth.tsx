import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { UNAUTHORIZED_EVENT } from '@/lib/db';
import type { Database } from '@/lib/dbTypes';

type AppRole = Database['public']['Enums']['app_role'];

export interface AuthUser {
  id: string;
  email: string | null;
}

/** Misma forma que usaba la app (session.user.id); ya no hay token en el navegador: la sesión viaja en una cookie httpOnly. */
export interface AuthSession {
  user: AuthUser;
}

interface AuthState {
  user: AuthUser | null;
  session: AuthSession | null;
  role: AppRole | null;
  establishmentId: string | null;
  loading: boolean;
  roleLoading: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  getRoleRedirectPath: (role: AppRole | null) => string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SIGNED_OUT: AuthState = {
  user: null,
  session: null,
  role: null,
  establishmentId: null,
  loading: false,
  roleLoading: false,
};

interface MeResponse {
  user: { id: string; email: string | null; role: AppRole | null; establishmentId: string | null } | null;
}

function toState(me: MeResponse): AuthState {
  if (!me.user) return SIGNED_OUT;
  const user = { id: me.user.id, email: me.user.email };
  return {
    user,
    session: { user },
    role: me.user.role,
    establishmentId: me.user.establishmentId,
    loading: false,
    roleLoading: false,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...SIGNED_OUT, loading: true });

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const me: MeResponse = res.ok ? await res.json() : { user: null };
      setState(toState(me));
    } catch {
      setState(SIGNED_OUT);
    }
  }, []);

  useEffect(() => {
    void loadMe();
    // Si el backend responde 401 (sesión vencida/revocada) volvemos al login.
    const onUnauthorized = () => setState((prev) => (prev.user ? SIGNED_OUT : prev));
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [loadMe]);

  const signIn = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) return { error: new Error(json?.error?.message ?? 'Credenciales incorrectas') };
      setState(toState(json));
      return { error: null };
    } catch (e) {
      return { error: e };
    }
  };

  const signOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      setState(SIGNED_OUT);
    }
  };

  const getRoleRedirectPath = (role: AppRole | null): string => {
    switch (role) {
      case 'superadmin': return '/superadmin';
      case 'admin': return '/admin';
      case 'cashier': return '/cashier';
      case 'waiter': return '/waiter';
      case 'kitchen': return '/kitchen';
      default: return '/login';
    }
  };

  const value: AuthContextValue = {
    ...state,
    signIn,
    signOut,
    getRoleRedirectPath,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

const defaultAuth: AuthContextValue = {
  ...SIGNED_OUT,
  loading: true,
  signIn: async () => ({ error: new Error('No AuthProvider') }),
  signOut: async () => {},
  getRoleRedirectPath: () => '/login',
};

export function useAuth() {
  const context = useContext(AuthContext);
  return context ?? defaultAuth;
}
