// Reemplazo de supabase.channel(...).on('postgres_changes', ...).subscribe().
// Todos los canales comparten una única conexión SSE (/api/events) que emite los NOTIFY de Postgres.

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

function ensureSource() {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource('/api/events', { withCredentials: true });
  source.onmessage = (m) => {
    try {
      dispatch(JSON.parse(m.data));
    } catch {
      /* mensaje inválido */
    }
  };
  source.onerror = () => {
    hadError = true;
  };
  source.onopen = () => {
    if (!hadError) return;
    hadError = false;
    // Tras una reconexión se pudieron perder eventos: refrescamos todo con un UPDATE sintético.
    for (const ch of channels) {
      for (const b of ch.bindings) {
        if (b.event === 'INSERT') continue;
        b.callback({ schema: 'public', table: b.table, eventType: 'UPDATE', new: {}, old: {} });
      }
    }
  };
}

function maybeCloseSource() {
  if (!channels.size && source) {
    source.close();
    source = null;
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
