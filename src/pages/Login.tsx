import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const invalidSessionHandled = useRef(false);
  const { user, role, loading, roleLoading, signIn, signOut, getRoleRedirectPath, blockedMessage } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || roleLoading) return;

    if (user && role) {
      navigate(getRoleRedirectPath(role), { replace: true });
      return;
    }

    if (user && !role && !invalidSessionHandled.current) {
      invalidSessionHandled.current = true;
      void signOut();
    }
  }, [user, role, loading, roleLoading, navigate, signOut, getRoleRedirectPath]);

  // si el servicio del local se suspendió mientras estaba la sesión abierta, se avisa al volver al login
  useEffect(() => {
    if (blockedMessage) toast.error(blockedMessage, { duration: 10000 });
  }, [blockedMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);

    if (error) {
      toast.error((error as Error)?.message || 'Credenciales incorrectas');
    }
  };

  if (loading || roleLoading) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="dark relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#0a0a0a] px-4 py-10">
      {/* Ambient ember glows */}
      <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[50%] w-[50%] rounded-full bg-orange-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] h-[50%] w-[50%] rounded-full bg-orange-900/20 blur-[120px]" />

      <div className="relative z-10 w-full max-w-4xl">
        <div className="flex overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl ring-1 ring-black/5 backdrop-blur-2xl">
          {/* Brand side */}
          <div className="relative hidden flex-col justify-between p-10 md:flex md:w-[46%] lg:p-12">
            {/* Local smoky gradient */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#1a120b] via-[#26180e]/70 to-transparent" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-orange-600/25 blur-[100px]" />

            <div className="relative">
              <span className="font-display text-4xl font-bold tracking-tight text-white lg:text-5xl">
                datta
              </span>
              <div className="mt-2 h-[3px] w-20 rounded-full bg-gradient-to-r from-orange-500 to-transparent" />
            </div>

            <div className="relative py-10">
              <h2 className="font-display text-3xl font-bold leading-tight text-white lg:text-4xl">
                Potencia tu negocio{' '}
                <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                  gastronómico
                </span>
                .
              </h2>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
                La herramienta definitiva para el control total de tu restaurante,
                bar o café.
              </p>

              <div className="mt-8 flex flex-col gap-3">
                {[
                  'Pedidos y mesas en tiempo real',
                  'Caja, turnos y facturación ARCA',
                  'Analíticas y márgenes claros',
                ].map(item => (
                  <div key={item} className="flex items-center gap-2.5 text-sm text-white/70">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500/15">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative flex items-center gap-2 text-xs font-medium text-white/40">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Plataforma operativa 24/7
            </div>
          </div>

          {/* Form side */}
          <div className="flex w-full flex-col justify-center p-8 sm:p-10 md:w-[54%] md:p-12">
            <div className="mb-9 flex flex-col items-center">
              {/* Mobile: full logo */}
              <div className="relative md:hidden">
                <span className="font-display text-4xl font-bold tracking-tight text-white">
                  datta
                </span>
                <div className="absolute -bottom-1.5 left-0 h-[3px] w-full rounded-full bg-gradient-to-r from-orange-500 to-transparent" />
              </div>
              {/* Desktop: compact heading */}
              <span className="hidden font-display text-sm font-semibold uppercase tracking-[0.35em] text-white/80 md:block">
                Bienvenido
              </span>
              <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.2em] text-orange-200/50">
                Sistema de gestión integral gastronómica
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="group space-y-2">
                <label
                  htmlFor="email"
                  className="ml-1 text-xs font-semibold text-white/50 transition-colors group-focus-within:text-orange-400"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="usuario@restaurante.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="h-12 rounded-xl border-white/10 bg-white/5 px-4 text-white placeholder:text-white/25 focus-visible:border-orange-500/50 focus-visible:ring-4 focus-visible:ring-orange-500/10"
                />
              </div>

              <div className="group space-y-2">
                <label
                  htmlFor="password"
                  className="ml-1 text-xs font-semibold text-white/50 transition-colors group-focus-within:text-orange-400"
                >
                  Contraseña
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="h-12 rounded-xl border-white/10 bg-white/5 px-4 text-white placeholder:text-white/25 focus-visible:border-orange-500/50 focus-visible:ring-4 focus-visible:ring-orange-500/10"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="group mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 font-semibold text-white shadow-lg shadow-orange-950/30 transition-all hover:from-orange-400 hover:to-orange-500 active:scale-[0.98] disabled:opacity-70"
              >
                <span>{isLoading ? 'Ingresando...' : 'Ingresar'}</span>
                {!isLoading && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                )}
              </button>
            </form>

            <div className="mt-8 border-t border-white/5 pt-6 text-center">
              <p className="text-xs text-white/30">
                © 2026 Datta · Gestión integral gastronómica
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
