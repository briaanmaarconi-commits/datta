// Cliente de datos de Datta. Mantiene la API que usaba la app con supabase-js
// (from/select/eq/..., rpc, channel, functions.invoke, storage) pero habla con el
// backend propio: POST /api/db/query, /api/db/rpc, /api/fn/*, /api/storage/*.
import { createChannel, removeChannel } from './realtime';
import { toast } from 'sonner';
import { getViewAs, viewAsHeaders } from './viewAs';

export interface DbError {
  message: string;
  code: string | null;
  details?: string | null;
  hint?: string | null;
}
export interface DbResult<T = any> {
  data: T;
  error: DbError | null;
  count: number | null;
}

export const UNAUTHORIZED_EVENT = 'datta:unauthorized';

/** En una pestaña "ver como" en solo mirar, el servidor rechaza las escrituras: se avisa siempre, aunque la pantalla no revise el error. */
let lastViewOnlyToast = 0;
function notifyIfViewOnly(error: any) {
  const code = error?.code;
  const blocked = code === 'VIEW_ONLY' || (code === '25006' && !!getViewAs() && !getViewAs()!.operate);
  if (!blocked || Date.now() - lastViewOnlyToast < 2000) return;
  lastViewOnlyToast = Date.now();
  toast.error('Modo solo mirar: activá «Operar» (arriba) para modificar datos.');
}

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...viewAsHeaders() },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* sin cuerpo */
  }
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  notifyIfViewOnly(json?.error);
  return { status: res.status, json };
}

type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is';

class QueryBuilder implements PromiseLike<DbResult> {
  private spec: any;

  constructor(table: string, private endpoint = '/api/db/query') {
    this.spec = { table, op: 'select', filters: [], order: [] };
  }

  select(columns = '*', opts?: { count?: 'exact'; head?: boolean }) {
    this.spec.select = columns;
    if (opts?.count) this.spec.count = opts.count;
    if (opts?.head) this.spec.head = true;
    return this;
  }
  insert(values: any) {
    this.spec.op = 'insert';
    this.spec.values = values;
    return this;
  }
  update(values: any) {
    this.spec.op = 'update';
    this.spec.values = values;
    return this;
  }
  delete() {
    this.spec.op = 'delete';
    return this;
  }

  private f(op: FilterOp, col: string, value: unknown, negate = false) {
    this.spec.filters.push({ col, op, value, ...(negate ? { negate: true } : {}) });
    return this;
  }
  eq(col: string, v: unknown) { return this.f('eq', col, v); }
  neq(col: string, v: unknown) { return this.f('neq', col, v); }
  gt(col: string, v: unknown) { return this.f('gt', col, v); }
  gte(col: string, v: unknown) { return this.f('gte', col, v); }
  lt(col: string, v: unknown) { return this.f('lt', col, v); }
  lte(col: string, v: unknown) { return this.f('lte', col, v); }
  like(col: string, v: unknown) { return this.f('like', col, v); }
  ilike(col: string, v: unknown) { return this.f('ilike', col, v); }
  in(col: string, v: unknown[]) { return this.f('in', col, v); }
  is(col: string, v: null | boolean) { return this.f('is', col, v); }
  not(col: string, op: FilterOp, v: unknown) { return this.f(op, col, v, true); }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.spec.order.push({ col, ascending: opts?.ascending ?? true, nullsFirst: opts?.nullsFirst });
    return this;
  }
  limit(n: number) {
    this.spec.limit = n;
    return this;
  }
  single() {
    this.spec.single = 'single';
    if (this.spec.op !== 'select' && !this.spec.select) this.spec.select = '*';
    return this;
  }
  maybeSingle() {
    this.spec.single = 'maybe';
    return this;
  }

  private async execute(): Promise<DbResult> {
    try {
      const { status, json } = await post(this.endpoint, this.spec);
      if (status === 401) return { data: null, count: null, error: { message: 'No autenticado', code: '401' } };
      if (!json) return { data: null, count: null, error: { message: `Error del servidor (${status})`, code: String(status) } };
      return { data: json.data ?? null, error: json.error ?? null, count: json.count ?? null };
    } catch (e: any) {
      return { data: null, count: null, error: { message: e?.message ?? 'Sin conexión con el servidor', code: 'NETWORK' } };
    }
  }

  then<R1 = DbResult, R2 = never>(
    onfulfilled?: ((value: DbResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

/** Respuesta de functions.invoke: en errores deja la Response en error.context, como supabase-js. */
async function invokeFunction(name: string, opts?: { body?: unknown; headers?: Record<string, string> }): Promise<DbResult> {
  try {
    const res = await fetch(`/api/fn/${name}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}), ...viewAsHeaders() },
      body: JSON.stringify(opts?.body ?? {}),
    });
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    if (!res.ok) {
      let message = `Error ${res.status}`;
      try {
        const j = await res.clone().json();
        message = j?.error?.message ?? j?.error ?? j?.message ?? message;
      } catch {
        /* cuerpo no JSON */
      }
      try { notifyIfViewOnly((await res.clone().json())?.error); } catch { /* no JSON */ }
      const err: any = new Error(typeof message === 'string' ? message : JSON.stringify(message));
      err.context = res;
      return { data: null, count: null, error: err };
    }
    const ct = res.headers.get('content-type') ?? '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    return { data, error: null, count: null };
  } catch (e: any) {
    return { data: null, count: null, error: { message: e?.message ?? 'Sin conexión con el servidor', code: 'NETWORK' } };
  }
}

const storage = {
  from(bucket: string) {
    return {
      async upload(path: string, file: File | Blob, _opts?: unknown): Promise<DbResult> {
        const form = new FormData();
        form.append('path', path);
        form.append('file', file);
        try {
          const res = await fetch(`/api/storage/${bucket}`, { method: 'POST', credentials: 'include', headers: viewAsHeaders(), body: form });
          const json: any = await res.json().catch(() => null);
          if (!res.ok) {
            notifyIfViewOnly(json?.error);
            return { data: null, count: null, error: { message: json?.error?.message ?? `Error ${res.status}`, code: String(res.status) } };
          }
          return { data: { path: json?.path ?? path }, error: null, count: null };
        } catch (e: any) {
          return { data: null, count: null, error: { message: e?.message ?? 'Sin conexión', code: 'NETWORK' } };
        }
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: `/files/${bucket}/${path}` } };
      },
    };
  },
};

/** Escrituras anónimas del QR (pedido, llamado de mozo, reseñas): el backend valida y deriva el establecimiento. */
export async function publicPost(path: string, body: unknown): Promise<{ ok: boolean; data: any; message?: string }> {
  try {
    const { status, json } = await post(path, body);
    if (status >= 200 && status < 300) return { ok: true, data: json };
    return { ok: false, data: null, message: json?.error?.message ?? `Error ${status}` };
  } catch (e: any) {
    return { ok: false, data: null, message: e?.message ?? 'Sin conexión con el servidor' };
  }
}

/** Lecturas sin login (carta del cliente): solo SELECT, con el rol anon del backend. */
export const dbPublic = {
  from: (table: string) => new QueryBuilder(table, '/api/public/query'),
};

export const db = {
  from: (table: string) => new QueryBuilder(table),
  async rpc(fn: string, args: Record<string, unknown> = {}): Promise<DbResult> {
    try {
      const { status, json } = await post('/api/db/rpc', { fn, args });
      if (status === 401) return { data: null, count: null, error: { message: 'No autenticado', code: '401' } };
      return { data: json?.data ?? null, error: json?.error ?? null, count: null };
    } catch (e: any) {
      return { data: null, count: null, error: { message: e?.message ?? 'Sin conexión', code: 'NETWORK' } };
    }
  },
  channel: createChannel,
  removeChannel,
  functions: { invoke: invokeFunction },
  storage,
};
