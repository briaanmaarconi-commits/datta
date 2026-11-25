// Reemplazo de supabase.channel(...).on('postgres_changes', ...).subscribe().
// Todos los canales comparten una única conexión SSE (/api/events) que emite los NOTIFY de Postgres.

import { viewAsQuery } from './viewAs';

type EventName = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface Binding {
  event: EventName;
  table: string;
  filter?: { column: string; value: string };
  callback: (payload: any) => void;
}

interface ServerEvent {
  table: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  id: string;
  est: string | null;
  new?: Record<string, unknown>;
}

const channels = new Set<RealtimeChannel>();
let source: EventSource | null = null;
let hadError = false;

function parseFilter(filter?: string): Binding['filter'] {
  const m = filter?.match(/^([a-z_]+)=eq\.(.+)$/);
  return m ? { column: m[1], value: m[2] } : undefined;
}

function dispatch(ev: ServerEvent) {
  for (const ch of channels) {
    for (const b of ch.bindings) {
      if (b.table !== ev.table) continue;
      if (b.event !== '*' && b.event !== ev.op) continue;
      // El servidor solo informa el establecimiento; los filtros de la app son por establishment_id.
      if (b.filter?.column === 'establishment_id' && ev.est !== b.filter.value) continue;
      const row = { id: ev.id, establishment_id: ev.est, ...(ev.new ?? {}) };
      b.callback({
        schema: 'public',
        table: ev.table,
        eventType: ev.op,
        new: ev.op === 'DELETE' ? {} : row,
        old: ev.op === 'INSERT' ? {} : { id: ev.id },
      });
    }
  }
}

/** Pide a todas las pantallas que vuelvan a cargar sus datos (UPDATE sintético): pudieron perderse cambios. */
function refreshAll() {
  for (const ch of channels) {
    for (const b of ch.bindings) {
      if (b.event === 'INSERT') continue;
      b.callback({ schema: 'public', table: b.table, eventType: 'UPDATE', new: {}, old: {} });
    }
  }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 2000;
/** Última vez que llegó algo del servidor (mensaje o latido "ping" cada 20 s). */
let lastSeen = 0;
/** Sin noticias del servidor en este tiempo = conexión muerta aunque el navegador la crea abierta. */
const DEAD_AFTER = 50_000;

/** Cierra la conexión actual y abre otra; al abrir se refresca todo (hadError). */
function reconnect() {
  source?.close();
  source = null;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  hadError = true;
  ensureSource();
}

function ensureSource() {
  if (source || typeof EventSource === 'undefined') return;
  const es = new EventSource(`/api/events${viewAsQuery()}`, { withCredentials: true });
  source = es;
  lastSeen = Date.now();
  es.addEventListener('ping', () => {
    lastSeen = Date.now();
  });
  es.onmessage = (m) => {
    lastSeen = Date.now();
    try {
      dispatch(JSON.parse(m.data));
    } catch {
      /* mensaje inválido */
    }
  };
  es.onerror = () => {
    hadError = true;
    // Si el servidor contestó con error (p. ej. mientras se publica una actualización), el navegador
    // no reintenta más y la pantalla quedaría sin cambios en vivo para siempre: reabrimos nosotros.
    if (es.readyState !== EventSource.CLOSED) return;
    if (source === es) source = null;
    if (retryTimer || !channels.size) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (channels.size) ensureSource();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30_000);
  };
  es.onopen = () => {
    lastSeen = Date.now();
    retryDelay = 2000;
    if (!hadError) return;
    hadError = false;
    refreshAll();
  };
}

// Al volver a la app (celular con la pantalla apagada o en otra app) refrescamos todo: en segundo plano
// la conexión se puede cortar sin aviso y la pantalla seguiría mostrando datos viejos (p. ej. precios).
if (typeof document !== 'undefined') {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (!channels.size || away < 15_000) return;
    if (!source || source.readyState === EventSource.CLOSED || Date.now() - lastSeen > DEAD_AFTER) reconnect();
    refreshAll();
  });
  // Vigía: si la conexión quedó "zombi" (abierta para el navegador pero sin latidos), se reabre.
  setInterval(() => {
    if (!channels.size || !source || document.visibilityState !== 'visible') return;
    if (Date.now() - lastSeen > DEAD_AFTER) reconnect();
  }, 15_000);
}

function maybeCloseSource() {
  if (channels.size) return;
  source?.close();
  source = null;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

export class RealtimeChannel {
  bindings: Binding[] = [];
  constructor(public name: string) {}

  on(
    _type: 'postgres_changes',
    opts: { event: EventName; schema?: string; table: string; filter?: string },
    callback: (payload: any) => void,
  ): this {
    this.bindings.push({ event: opts.event, table: opts.table, filter: parseFilter(opts.filter), callback });
    return this;
  }

  subscribe(statusCallback?: (status: string) => void): this {
    channels.add(this);
    ensureSource();
    statusCallback?.('SUBSCRIBED');
    return this;
  }

  unsubscribe() {
    channels.delete(this);
    maybeCloseSource();
  }
}

export const createChannel = (name: string) => new RealtimeChannel(name);
export const removeChannel = (ch: RealtimeChannel) => {
  ch.unsubscribe();
  return Promise.resolve('ok');
};
