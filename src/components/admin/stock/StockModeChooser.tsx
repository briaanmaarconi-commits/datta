import { CheckCircle2, ChefHat, Loader2, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type InventoryMode = 'simple' | 'advanced';

const OPTIONS: { id: InventoryMode; title: string; icon: typeof Package; text: string; example: string; ideal: string }[] = [
  {
    id: 'simple',
    title: 'Gestión de stock simple',
    icon: Package,
    text: 'Contás tu inventario en porciones o unidades. Cada venta descuenta 1 sola.',
    example: 'Ej.: "tengo 200 medallones de hamburguesa, 50 porciones de ojo de bife y 48 latas de gaseosa".',
    ideal: 'Ideal si porcionás la mercadería cuando llega o vendés productos que ya vienen listos.',
  },
  {
    id: 'advanced',
    title: 'Gestión de stock avanzada',
    icon: ChefHat,
    text: 'Contás los ingredientes (kg, g, litros) y cargás la receta de cada plato. Cada venta descuenta los ingredientes que lleva.',
    example: 'Ej.: compraste 10 kg de carne; cada hamburguesa usa 150 g, así que se descuentan solos al venderla.',
    ideal: 'Ideal para controlar costos al detalle. Bebidas, postres o empanadas se pueden seguir contando por unidad.',
  },
];

/** Elección del modo de stock: dos tarjetas grandes con su explicación. */
export default function StockModeChooser({ current, onChoose, saving }: {
  current: InventoryMode | null;
  onChoose: (mode: InventoryMode) => void;
  saving: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {OPTIONS.map(o => {
        const active = current === o.id;
        return (
          <div key={o.id} className={cn('flex flex-col gap-4 rounded-xl border bg-card p-5', active && 'border-primary ring-1 ring-primary')}>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><o.icon className="h-6 w-6" /></div>
              <div>
                <h3 className="text-lg font-semibold leading-tight">{o.title}</h3>
                {active && <p className="mt-0.5 flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="h-3.5 w-3.5" />Es el modo que usás ahora</p>}
              </div>
            </div>
            <div className="flex-1 space-y-2 text-sm">
              <p>{o.text}</p>
              <p className="text-muted-foreground">{o.example}</p>
              <p className="text-muted-foreground">{o.ideal}</p>
            </div>
            <Button variant={active ? 'outline' : 'default'} disabled={saving || active} onClick={() => onChoose(o.id)} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {active ? 'Seleccionado' : `Usar ${o.id === 'simple' ? 'simple' : 'avanzada'}`}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
