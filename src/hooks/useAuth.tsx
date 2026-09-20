import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface AuthState {
  user: User | null;
  session: Session | null;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    role: null,
    establishmentId: null,
    loading: true,
    roleLoading: false,
  });
  const roleFetchedFor = useRef<string | null>(null);

  const fetchUserRole = useCallback(async (userId: string, force = false) => {
    if (!force && roleFetchedFor.current === userId) {
      setState(prev => (prev.roleLoading ? { ...prev, roleLoading: false } : prev));
      return;
    }
    roleFetchedFor.current = userId;
    setState(prev => ({ ...prev, roleLoading: true }));
    const { data } = await supabase
      .from('user_roles')
      .select('role, establishment_id')
      .eq('user_id', userId)
      .order('role')
      .limit(1)
      .maybeSingle();

    setState(prev => ({
      ...prev,
      role: data?.role as AppRole ?? null,
      establishmentId: data?.establishment_id ?? null,
      roleLoading: false,
    }));
  }, []);


  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const alreadyFetched = roleFetchedFor.current === session.user.id;
          setState(prev => ({
            ...prev,
            user: session.user,
            session,
            loading: false,
            roleLoading: alreadyFetched ? prev.roleLoading : true,
          }));
          if (!alreadyFetched) setTimeout(() => fetchUserRole(session.user.id), 0);

        } else {
          roleFetchedFor.current = null;
          setState({
            user: null,
            session: null,
            role: null,
            establishmentId: null,
            loading: false,
            roleLoading: false,
          });
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const alreadyFetched = roleFetchedFor.current === session.user.id;
        setState(prev => ({
          ...prev,
          user: session.user,
          session,
          loading: false,
          roleLoading: alreadyFetched ? prev.roleLoading : true,
        }));
        fetchUserRole(session.user.id);

      } else {
        setState(prev => ({
          ...prev,
          user: null,
          session: null,
          loading: false,
        }));
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserRole]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    roleFetchedFor.current = null;
    setState({ user: null, session: null, role: null, establishmentId: null, loading: false, roleLoading: false });
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
  user: null,
  session: null,
  role: null,
  establishmentId: null,
  loading: true,
  roleLoading: false,
  signIn: async () => ({ error: new Error('No AuthProvider') }),
  signOut: async () => {},
  getRoleRedirectPath: () => '/login',
};

export function useAuth() {
  const context = useContext(AuthContext);
  return context ?? defaultAuth;
}
