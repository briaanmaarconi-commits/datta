import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';

export interface CourtesyAccount {
  id: string;
  establishment_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

/** Personas con cuenta corriente de cortesías del establecimiento. */
export function useCourtesyAccounts(establishmentId?: string | null, onlyActive = true) {
  return useQuery({
    queryKey: ['courtesy_accounts', establishmentId, onlyActive],
    enabled: !!establishmentId,
    queryFn: async () => {
      let q = db
        .from('courtesy_accounts')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .order('name');
      if (onlyActive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CourtesyAccount[];
    },
  });
}
