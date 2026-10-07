import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronUp, HelpCircle, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { callFn } from '@/lib/fnApi';

type Verdict = 'can_raise' | 'careful' | 'lower_helped' | 'inconclusive' | 'no_change' | 'not_enough_data';
interface Level { price: number; days: number; units: number; per100: number }
interface Item {
  product_id: string; name: string; current_price: number; verdict: Verdict; summary: string; units: number;
  before?: Level; after?: Level; price_change_pct?: number; demand_change_pct?: number; revenue_change_pct?: number; elasticity?: number;
}

const VERDICT: Record<Verdict, { label: string; className: string; icon: typeof TrendingUp }> = {
  can_raise: { label: 'Aguanta aumentos', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400', icon: TrendingUp },
  careful: { label: 'Sensible al precio', className: 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400', icon: AlertTriangle },
  lower_helped: { label: 'Bajarlo funcionó', className: 'bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400', icon: TrendingDown },
  inconclusive: { label: 'Sin conclusión', className: 'bg-muted text-muted-foreground border-border', icon: HelpCircle },
  no_change: { label: 'Sin cambios de precio', className: 'bg-muted text-muted-foreground border-border', icon: HelpCircle },
  not_enough_data: { label: 'Faltan datos', className: 'bg-muted text-muted-foreground border-border', icon: HelpCircle },
};
const money = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

/**
 * "¿Puedo subir los precios?": compara el último cambio de precio de cada plato (últimos 6 meses)
 * midiendo cuánto se vende cada 100 pedidos. El cálculo vive en backend/src/lib/priceSensitivity.ts.
 */
export default function PriceSensitivityCard() {
  const [showAll, setShowAll] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['price-sensitivity'],
    queryFn: () => callFn<{ lookback_days: number; products: Item[] }>('price-sensitivity'),
    staleTime: 10 * 60_000,
  });

  const items = data?.products ?? [];
  const measured = items.filter(i => ['can_raise', 'careful', 'lower_helped', 'inconclusive'].includes(i.verdict));
  const unmeasured = items.length - measured.length;
  const visible = showAll ? measured : measured.slice(0, 6);
  const count = (v: Verdict) => measured.filter(i => i.verdict === v).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">¿Puedo subir los precios?</CardTitle>
        <p className="text-xs text-muted-foreground">
          Miramos el último cambio de precio de cada plato en los últimos {Math.round((data?.lookback_days ?? 180) / 30)} meses y si después se vendió más o menos
          (cada 100 pedidos, para que un mes flojo o uno fuerte no confunda). No depende del período elegido arriba.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <p className="text-sm text-destructive">No se pudo calcular: {(error as Error).message}</p>
        ) : measured.length === 0 ? (
          <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            Todavía no hay cambios de precio para analizar. Cuando ajustes precios en la carta, a las pocas semanas vas a ver acá cuáles platos aguantan aumentos y cuáles no.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              {count('can_raise') > 0 && <Badge variant="outline" className={VERDICT.can_raise.className}>{count('can_raise')} aguantan aumentos</Badge>}
              {count('careful') > 0 && <Badge variant="outline" className={VERDICT.careful.className}>{count('careful')} sensibles al precio</Badge>}
              {count('lower_helped') > 0 && <Badge variant="outline" className={VERDICT.lower_helped.className}>{count('lower_helped')} vendieron más al bajar</Badge>}
            </div>
            <ul className="divide-y rounded-md border">
              {visible.map(i => {
                const v = VERDICT[i.verdict];
                const open = detail === i.product_id;
                return (
                  <li key={i.product_id} className="space-y-1.5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{i.name}</span>
                      <Badge variant="outline" className={cn('gap-1', v.className)}><v.icon className="h-3 w-3" />{v.label}</Badge>
                      <span className="ml-auto text-sm text-muted-foreground">Hoy {money(i.current_price)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{i.summary}</p>
                    {i.before && i.after && (
                      <button type="button" className="text-xs text-primary hover:underline" onClick={() => setDetail(open ? null : i.product_id)}>
                        {open ? 'Ocultar detalle' : 'Ver detalle'}
                      </button>
                    )}
                    {open && i.before && i.after && (
                      <div className="grid gap-2 rounded-md bg-muted/40 p-2 text-xs sm:grid-cols-2">
                        <div>Antes: {money(i.before.price)} · {i.before.days} días · {i.before.per100} cada 100 pedidos</div>
                        <div>Después: {money(i.after.price)} · {i.after.days} días · {i.after.per100} cada 100 pedidos</div>
                        <div>Precio {i.price_change_pct! > 0 ? '+' : ''}{i.price_change_pct}% · Ventas {i.demand_change_pct! > 0 ? '+' : ''}{i.demand_change_pct}% · Facturación del plato {i.revenue_change_pct! > 0 ? '+' : ''}{i.revenue_change_pct}%</div>
                        <div>Elasticidad: {i.elasticity} (entre 0 y -1 aguanta aumentos; menor a -1 es sensible)</div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {measured.length > 6 && (
              <div className="flex justify-center">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowAll(s => !s)}>
                  {showAll ? <>Ver menos <ChevronUp className="h-3.5 w-3.5" /></> : <>Ver todos ({measured.length}) <ChevronDown className="h-3.5 w-3.5" /></>}
                </Button>
              </div>
            )}
          </>
        )}
        {!isLoading && unmeasured > 0 && (
          <p className="text-xs text-muted-foreground">{unmeasured} productos no cambiaron de precio o tienen pocas ventas: no se pueden medir todavía.</p>
        )}
        <p className="text-xs text-muted-foreground">Tip: preguntale al asistente "¿qué platos puedo subir de precio?" y te lo explica.</p>
      </CardContent>
    </Card>
  );
}
