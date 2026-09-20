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

