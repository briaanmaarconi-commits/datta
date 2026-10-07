import { UNAUTHORIZED_EVENT } from '@/lib/db';

/** Llama a /api/fn/billing/<acción> (solo superadmin) y devuelve el JSON o lanza Error con el mensaje del servidor. */
export async function billing<T = any>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`/api/fn/billing/${action}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? json?.error ?? `Error ${res.status}`);
  return json as T;
}

/** Llama a /api/fn/clients/<acción> (solo superadmin). */
export async function clientsApi<T = any>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`/api/fn/clients/${action}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? json?.error ?? `Error ${res.status}`);
  return json as T;
}

export type EffectiveStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';

export interface BillingClient {
  id: string;
  name: string;
  city: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  service_status: string;
  effective_status: EffectiveStatus;
  agreed_price: number;
  trial_ends_at: string | null;
  next_due_date: string | null;
  overdue_days: number;
  days_to_suspension: number | null;
  billing_configured: boolean;
  mp_preapproval_id: string | null;
  mp_status: string | null;
  mp_init_point: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  last_payment_date: string | null;
  last_payment_amount: number | null;
}

export interface BillingOverview {
  today: string;
  grace_days: number;
  mp_enabled: boolean;
  plan_price: number;
  totals: { mrr: number; collected_this_month: number; counts: Record<EffectiveStatus, number> };
  clients: BillingClient[];
}

export const STATUS_LABELS: Record<string, string> = {
  trial: 'Prueba gratis',
  active: 'Al día',
  past_due: 'Vencido',
  suspended: 'Suspendido',
  cancelled: 'Cancelado',
};
export const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  trial: 'secondary',
  active: 'default',
  past_due: 'destructive',
  suspended: 'destructive',
  cancelled: 'outline',
};

export const money = (n: number | null | undefined) => `$${Number(n ?? 0).toLocaleString('es-AR')}`;
export const fmtDate = (d?: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR') : '—');
