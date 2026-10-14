// Cliente del Agente de impresión de Datta (programa local de la PC de cocina, ver /agent).
// El agente escucha solo en 127.0.0.1 y reparte cada comanda a la impresora de su sector.

export type PrepArea = 'entrada' | 'principal' | 'postre' | 'bebida';
export const PREP_AREAS: PrepArea[] = ['entrada', 'principal', 'postre', 'bebida'];
export const PREP_AREA_LABEL: Record<PrepArea, string> = {
  entrada: 'Entrada',
  principal: 'Plato principal',
  postre: 'Postre',
  bebida: 'Bebidas',
};
/** Sector donde sale lo que no tiene sector asignado: nada se pierde. */
export const DEFAULT_PREP_AREA: PrepArea = 'principal';

const BASE = 'http://127.0.0.1:9101';

export interface PrintStation {
  id: string;
  prep_area: PrepArea;
  printer_name: string;
  paper_width: 58 | 80;
  is_active: boolean;
}

export interface AgentJob {
  area: PrepArea;
  establishmentName?: string;
  tableNumber?: number | string | null;
  isDelivery?: boolean;
  platform?: string | null;
  customerName?: string | null;
  sectorName?: string | null;
  createdAt: string;
  isAddition?: boolean;
  reprint?: boolean;
  items: { quantity: number; name: string; notes?: string | null }[];
}

async function agentFetch<T>(path: string, init?: RequestInit, timeoutMs = 4000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + path, { ...init, signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body?.ok === false) throw new Error(body?.error || `Agente respondió ${r.status}`);
    return body as T;
  } finally {
    clearTimeout(t);
  }
}

/** true si el agente responde en esta PC. */
export async function agentOnline(): Promise<boolean> {
  try {
    await agentFetch('/status', undefined, 1500);
    return true;
  } catch {
    return false;
  }
}

export async function agentPrinters(): Promise<string[]> {
  const r = await agentFetch<{ printers: string[] }>('/printers', undefined, 8000);
  return r.printers;
}

export async function agentPrint(station: Pick<PrintStation, 'printer_name' | 'paper_width'>, job: AgentJob): Promise<void> {
  await agentFetch(
    '/print',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ printer: station.printer_name, paperWidth: station.paper_width, job }),
    },
    10000,
  );
}

/**
 * Reparte los ítems por sector. Un sector sin impresora activa cae en el principal; sin ninguno, en `rest`.
 * Excepción: las bebidas sin impresora propia no se imprimen (no tienen comanda de cocina que preparar).
 */
export function groupByStation<T extends { area?: PrepArea | null }>(items: T[], stations: PrintStation[]) {
  const active = new Map(stations.filter((s) => s.is_active).map((s) => [s.prep_area, s]));
  const groups = new Map<PrepArea, T[]>();
  const rest: T[] = [];
  for (const it of items) {
    if (it.area === 'bebida' && !active.has('bebida')) continue;
    let area: PrepArea = it.area ?? DEFAULT_PREP_AREA;
    if (!active.has(area)) area = DEFAULT_PREP_AREA;
    if (!active.has(area)) {
      rest.push(it);
      continue;
    }
    groups.set(area, [...(groups.get(area) ?? []), it]);
  }
  return { groups, rest, active };
}
