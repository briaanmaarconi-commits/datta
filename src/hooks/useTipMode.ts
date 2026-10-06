import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';

export type TipMode = 'pool' | 'individual';

/** Fetches the current tip distribution mode for an establishment. */
export function useTipMode(establishmentId: string | null | undefined) {
  return useQuery({
    queryKey: ['establishment-tip-mode', establishmentId],
    queryFn: async (): Promise<TipMode> => {
      const { data, error } = await db
        .from('establishments')
        .select('tip_mode')
        .eq('id', establishmentId!)
        .single();
      if (error) throw error;
      return ((data as any)?.tip_mode || 'individual') as TipMode;
    },
    enabled: !!establishmentId,
  });
}
