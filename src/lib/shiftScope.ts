import { toArgDate, argDayRange } from '@/lib/utils';

/**
 * Devuelve el timestamp ISO desde el cual un pedido se considera "vigente" para una mesa.
 * - Si hay turno abierto: desde que se abrió el turno (o su creación).
 * - Si no hay turno: desde el inicio del día en hora Argentina.
 *
 * Cualquier pedido anterior a ese corte quedó colgado (nunca se cerró ni se canceló)
 * y NO debe sumarse a la cuenta del cliente actual.
 */
export function getOrdersCutoff(activeShift?: { opened_at?: string | null; created_at?: string | null } | null): string {
  const dayStart = argDayRange(toArgDate(new Date())).from;
  const candidates = [activeShift?.opened_at, activeShift?.created_at]
    .filter(Boolean)
    .map(v => new Date(v as string).getTime());
  if (candidates.length === 0) return dayStart;

  // El turno puede haberse creado antes de marcarse como "abierto": tomamos el momento
  // más temprano para no dejar afuera pedidos cargados durante la apertura.
  const earliest = Math.min(...candidates);
  const dayStartMs = new Date(dayStart).getTime();

  // Si el turno arrancó hoy, nunca cortar después del inicio del día:
  // un pedido de hoy siempre pertenece al turno de hoy.
  if (earliest >= dayStartMs) return dayStart;
  return new Date(earliest).toISOString();
}

const AR_TZ = 'America/Argentina/Buenos_Aires';

type ShiftLike = {
  shift_date?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
} | null | undefined;

/**
 * Momento real de apertura del turno. `created_at` lo pone el servidor; `opened_at` en turnos
 * viejos venía del reloj de la PC de caja, que puede estar adelantado. Tomamos el más temprano
 * para que ningún cobro hecho apenas abierto el turno quede afuera del resumen.
 */
export function getShiftStart(shift: ShiftLike): string | null {
  if (!shift) return null;
  const candidates = [shift.opened_at, shift.created_at]
    .filter(Boolean)
    .map(v => new Date(v as string).getTime());
  if (candidates.length === 0) return shift.shift_date ? `${shift.shift_date}T00:00:00.000Z` : null;
  return new Date(Math.min(...candidates)).toISOString();
}

/** Ventana [desde, hasta] para buscar los movimientos de un turno (abierto o cerrado). */
export function getShiftWindow(shift: ShiftLike): { from: string; to: string } {
  return {
    from: getShiftStart(shift) ?? new Date(0).toISOString(),
    to: shift?.closed_at ?? new Date().toISOString(),
  };
}

/**
 * Fecha (YYYY-MM-DD, hora Argentina) que le corresponde al turno: la de su apertura.
 * Un turno que abre 22:00 y cierra 02:00 pertenece al día en que se abrió la caja.
 */
export function getShiftDisplayDate(shift: ShiftLike): string | null {
  if (!shift) return null;
  if (shift.opened_at || shift.created_at) return toArgDate(getShiftStart(shift)!);
  return shift.shift_date ?? null;
}

/** Fecha del turno formateada dd/mm/aaaa según la apertura. */
export function formatShiftDate(shift: ShiftLike): string {
  const d = getShiftDisplayDate(shift);
  if (!d) return '-';
  return new Date(d + 'T12:00:00').toLocaleDateString('es');
}

function argTime(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('es', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: AR_TZ,
  });
}

/** Rango horario del turno, marcando cuando el cierre cae en el día siguiente. */
export function formatShiftRange(shift: ShiftLike): string {
  if (!shift) return '-';
  const openedAt = shift.opened_at || shift.created_at ? getShiftStart(shift) : null;
  const start = argTime(openedAt);
  const end = argTime(shift.closed_at);
  let suffix = '';
  if (openedAt && shift.closed_at) {
    const openDay = toArgDate(openedAt);
    const closeDay = toArgDate(shift.closed_at);
    if (openDay !== closeDay) {
      const days = Math.round(
        (new Date(closeDay + 'T12:00:00').getTime() - new Date(openDay + 'T12:00:00').getTime()) / 86400000,
      );
      suffix = days === 1 ? ' (+1 día)' : ` (+${days} días)`;
    }
  }
  return `${start} → ${end}${suffix}`;
}

