import { useSyncExternalStore } from 'react';

/**
 * "Ver como": un superadmin mira (o, si lo activa, opera) la cocina, caja o mozo de un local.
 * El contexto vive en sessionStorage, es decir POR PESTAÑA: se pueden tener varias pestañas de locales distintos
 * y la del panel de superadmin queda intacta. El servidor solo lo respeta si la sesión real es de un superadmin.
 */
export type ViewRole = 'kitchen' | 'cashier' | 'waiter';

export interface ViewAsCtx {
  establishmentId: string;
  name: string;
  role: ViewRole;
  /** false = solo mirar (por defecto); true = puede modificar datos. */
  operate: boolean;
}

const KEY = 'datta-view-as';
export const VIEW_PATH: Record<ViewRole, string> = { kitchen: '/kitchen', cashier: '/cashier', waiter: '/waiter' };
export const VIEW_LABEL: Record<ViewRole, string> = { kitchen: 'Cocina', cashier: 'Caja', waiter: 'Mozo' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let ctx: ViewAsCtx | null = null;
const listeners = new Set<() => void>();

const isRole = (v: unknown): v is ViewRole => v === 'kitchen' || v === 'cashier' || v === 'waiter';

function persist() {
  try {
    if (ctx) sessionStorage.setItem(KEY, JSON.stringify(ctx));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* sessionStorage no disponible: el contexto vive solo en memoria */
  }
}

function load() {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && UUID.test(parsed.establishmentId) && isRole(parsed.role)) {
      ctx = { establishmentId: parsed.establishmentId, name: String(parsed.name ?? ''), role: parsed.role, operate: !!parsed.operate };
    }
  } catch {
    ctx = null;
  }
  // Pestaña recién abierta desde el panel: /kitchen?viewAs=<id>&role=kitchen&name=... (siempre arranca en "solo mirar").
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search);
    const id = q.get('viewAs');
    const role = q.get('role');
    if (id && UUID.test(id) && isRole(role)) {
      ctx = { establishmentId: id.toLowerCase(), name: q.get('name') ?? '', role, operate: false };
      persist();
      q.delete('viewAs');
      q.delete('role');
      q.delete('name');
      const rest = q.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
    }
  }
}
load();

const emit = () => listeners.forEach((l) => l());

export const getViewAs = () => ctx;

export function setOperate(operate: boolean) {
  if (!ctx) return;
  ctx = { ...ctx, operate };
  persist();
  emit();
}

export function clearViewAs() {
  ctx = null;
  persist();
  emit();
}

/** Cabeceras que se agregan a cada llamada al backend desde una pestaña "ver como". */
export function viewAsHeaders(): Record<string, string> {
  return ctx ? { 'x-view-as': ctx.establishmentId, 'x-view-mode': ctx.operate ? 'operate' : 'spectate' } : {};
}

/** Parámetros para el EventSource (no admite cabeceras). */
export function viewAsQuery(): string {
  return ctx ? `?viewAs=${ctx.establishmentId}&viewMode=${ctx.operate ? 'operate' : 'spectate'}` : '';
}

export function useViewAsCtx(): ViewAsCtx | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => ctx,
  );
}

/** Abre la pantalla de un rol de un local en una pestaña nueva (solo mirar). */
export function openViewAs(est: { id: string; name: string }, role: ViewRole) {
  const q = new URLSearchParams({ viewAs: est.id, role, name: est.name });
  window.open(`${VIEW_PATH[role]}?${q.toString()}`, '_blank', 'noopener');
}
