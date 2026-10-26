import { Button } from '@/components/ui/button';
import { Flame, IceCreamCone, Tag } from 'lucide-react';

export type QuickFilter = '__promos' | '__popular' | '__desserts';

interface PromoBannersProps {
  promoProducts: any[];
  popularProducts: any[];
  dessertProducts: any[];
  active: string | null;
  onSelect: (filter: QuickFilter) => void;
}

/** Accesos rápidos de la carta: filtran la lista de productos (sin fotos genéricas que confundan). */
export default function PromoBanners({ promoProducts, popularProducts, dessertProducts, active, onSelect }: PromoBannersProps) {
  const buttons = [
    { key: '__popular' as const, icon: Flame, label: 'Ver los más pedidos', show: popularProducts.length > 0 },
    { key: '__desserts' as const, icon: IceCreamCone, label: 'Ver postres más pedidos', show: dessertProducts.length > 0 },
    { key: '__promos' as const, icon: Tag, label: 'Ver promociones', show: promoProducts.length > 0 },
  ].filter(b => b.show);

  if (buttons.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map(b => (
        <Button
          key={b.key}
          size="sm"
          variant={active === b.key ? 'default' : 'outline'}
          className="gap-1.5"
          onClick={() => onSelect(b.key)}
        >
          <b.icon className="h-4 w-4" />
          {b.label}
        </Button>
      ))}
    </div>
  );
}
