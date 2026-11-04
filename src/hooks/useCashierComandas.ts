import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { COMANDA_PRINT_EVENT, readCashierComandaLocal, setCashierComandaLocal } from '@/lib/comandaPrint';

/**
 * Interruptor de comandas en la PC de caja.
 * - `on`: esta PC imprime (solo si alguien lo prendió en este navegador).
 * - `showWarning`: el local imprime comandas por caja pero este navegador nunca lo configuró (datos borrados, otro
 *   acceso directo u otra compu): se avisa para prenderlo o descartarlo, nunca se prende solo.
 */
export function useCashierComandas() {
  const { establishmentId, viewAs } = useAuth();
  const qc = useQueryClient();
  const [local, setLocal] = useState(() => readCashierComandaLocal(establishmentId));

  useEffect(() => {
    const read = () => setLocal(readCashierComandaLocal(establishmentId));
    read();
    window.addEventListener(COMANDA_PRINT_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(COMANDA_PRINT_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, [establishmentId]);

  const queryKey = ['cashier-comandas-flag', establishmentId];
  const { data: server, isFetched } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await db.from('establishments').select('cashier_comandas').eq('id', establishmentId!).maybeSingle();
      if (error) throw error;
      return !!(data as { cashier_comandas?: boolean | null } | null)?.cashier_comandas;
    },
    enabled: !!establishmentId && !viewAs,
    staleTime: 5 * 60_000,
  });

  const markLocalUsesIt = async () => {
    if (!establishmentId || viewAs) return;
    const { error } = await db.from('establishments').update({ cashier_comandas: true } as never).eq('id', establishmentId);
    if (error) console.warn('No se pudo guardar en el local que imprime comandas por caja', error);
    else qc.setQueryData(queryKey, true);
  };

  // Cajas que ya lo tenían prendido antes de este cambio: se lo cuentan al local.
  useEffect(() => {
    if (isFetched && server === false && local === true) void markLocalUsesIt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetched, server, local, establishmentId]);

  const setOn = async (on: boolean) => {
    setCashierComandaLocal(establishmentId, on);
    setLocal(on);
    if (on) await markLocalUsesIt();
  };

  return {
    on: local === true,
    showWarning: !viewAs && isFetched && server === true && local === null,
    setOn,
  };
}
