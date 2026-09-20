import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useActiveShift() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();

  const { data: activeShift, isLoading } = useQuery({
    queryKey: ['active-shift', establishmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('shift_controls')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .is('closed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!establishmentId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 10_000,
  });


  // Realtime: instantly react to shift open/close
  useEffect(() => {
    if (!establishmentId) return;
    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: ['active-shift', establishmentId] });

    const channel = supabase
      .channel(`active-shift-${establishmentId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shift_controls', filter: `establishment_id=eq.${establishmentId}` },
        invalidate
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') invalidate();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [establishmentId, queryClient]);


  return { activeShift, isShiftOpen: !!activeShift, isLoading };
}
