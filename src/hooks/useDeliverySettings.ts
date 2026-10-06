import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';

export type DeliveryPlatform = 'rappi' | 'pedidosya' | 'propio';

export const PLATFORM_LABELS: Record<DeliveryPlatform, string> = {
  rappi: 'Rappi',
  pedidosya: 'PedidosYa',
  propio: 'Delivery propio',
};

export const PLATFORM_COLORS: Record<DeliveryPlatform, string> = {
  rappi: 'bg-[hsl(var(--chart-1))]/15 text-[hsl(var(--chart-1))] border-[hsl(var(--chart-1))]/30',
  pedidosya: 'bg-destructive/15 text-destructive border-destructive/30',
  propio: 'bg-primary/15 text-primary border-primary/30',
};

export interface DeliverySettings {
  enabled: boolean;
  commissions: Record<DeliveryPlatform, number>;
}

export function useDeliverySettings() {
  const { establishmentId } = useAuth();

  const query = useQuery({
    queryKey: ['delivery-settings', establishmentId],
    queryFn: async (): Promise<DeliverySettings> => {
      const { data, error } = await db
        .from('establishments')
        .select('delivery_enabled, rappi_commission, peya_commission')
        .eq('id', establishmentId!)
        .maybeSingle();
      if (error) throw error;
      return {
        enabled: !!data?.delivery_enabled,
        commissions: {
          rappi: Number(data?.rappi_commission ?? 0),
          pedidosya: Number(data?.peya_commission ?? 0),
          propio: 0,
        },
      };
    },
    enabled: !!establishmentId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    ...query,
    enabled: !!query.data?.enabled,
    commissions: query.data?.commissions ?? { rappi: 0, pedidosya: 0, propio: 0 },
  };
}
