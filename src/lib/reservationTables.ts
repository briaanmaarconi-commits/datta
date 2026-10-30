import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';

/** Una reserva ocupa la mesa este tiempo antes y después de su horario. */
export const RESERVATION_BLOCK_HOURS = 2;
const BLOCK_MS = RESERVATION_BLOCK_HOURS * 60 * 60 * 1000;

interface ReservableTable { id: string; number: number; capacity: number }
interface TableReservation { table_id: string; reservation_at: string }

/**
 * Mesas donde entra el grupo y que no tienen otra reserva confirmada cerca de ese horario.
 * Ordenadas de la más chica a la más grande, para no gastar una mesa grande en un grupo chico.
 */
export function freeTablesFor<T extends ReservableTable>(
  tables: T[], reservations: TableReservation[], partySize: number, at: Date | null,
): T[] {
  const time = at?.getTime();
  const busy = new Set(
    time === undefined || Number.isNaN(time)
      ? []
      : reservations
          .filter(r => Math.abs(new Date(r.reservation_at).getTime() - time) < BLOCK_MS)
          .map(r => r.table_id),
  );
  return tables
    .filter(t => t.capacity >= partySize && !busy.has(t.id))
    .sort((a, b) => a.capacity - b.capacity || a.number - b.number);
}

/** Reservas confirmadas alrededor del horario elegido (para saber qué mesas ya están tomadas). */
export function useReservationsAround(establishmentId: string | null | undefined, at: Date | null) {
  const time = at?.getTime();
  const valid = time !== undefined && !Number.isNaN(time);
  return useQuery({
    queryKey: ['reservations', establishmentId, 'around', valid ? time : null],
    queryFn: async () => {
      const { data, error } = await db
        .from('reservations' as any)
        .select('table_id, reservation_at')
        .eq('establishment_id', establishmentId!)
        .eq('status', 'confirmed')
        .gt('reservation_at', new Date(time! - BLOCK_MS).toISOString())
        .lt('reservation_at', new Date(time! + BLOCK_MS).toISOString());
      if (error) throw error;
      return (data || []) as unknown as TableReservation[];
    },
    enabled: !!establishmentId && valid,
  });
}
