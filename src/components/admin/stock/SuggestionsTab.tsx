import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, TrendingUp, ShoppingCart } from 'lucide-react';
import { useShowMore, ShowMoreButton } from '@/components/ui/show-more';

export default function SuggestionsTab() {
  const { establishmentId } = useAuth();

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('ingredients').select('*').eq('establishment_id', establishmentId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!establishmentId,
  });

  // Get last 30 days of sale movements to calculate daily consumption
  const { data: saleMovements = [] } = useQuery({
    queryKey: ['stock_movements', 'sales_30d', establishmentId],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data } = await db.from('stock_movements').select('ingredient_id, quantity')
        .eq('establishment_id', establishmentId!)
        .eq('type', 'sale')
        .gte('created_at', thirtyDaysAgo.toISOString());
      return data || [];
    },
    enabled: !!establishmentId,
  });

  // Calculate daily consumption per ingredient
  const consumptionMap = new Map<string, number>();
  saleMovements.forEach((m: any) => {
    const current = consumptionMap.get(m.ingredient_id) || 0;
    consumptionMap.set(m.ingredient_id, current + Math.abs(m.quantity));
  });

  const COVERAGE_DAYS = 7;

  const suggestions = ingredients
    .map((ing: any) => {
      const totalConsumed = consumptionMap.get(ing.id) || 0;
      const dailyAvg = totalConsumed / 30;
      const daysOfStock = dailyAvg > 0 ? ing.current_stock / dailyAvg : Infinity;
      const neededForCoverage = Math.max(0, (dailyAvg * COVERAGE_DAYS) - ing.current_stock);
      return { ...ing, dailyAvg, daysOfStock, neededForCoverage, totalConsumed };
    })
    .filter(s => s.dailyAvg > 0)
    .sort((a, b) => a.daysOfStock - b.daysOfStock);

  const needsBuying = suggestions.filter(s => s.daysOfStock < COVERAGE_DAYS);
  const buyingList = useShowMore<any>(needsBuying, 8);
  const topConsumed = [...suggestions].sort((a, b) => b.totalConsumed - a.totalConsumed).slice(0, 5);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Sugerencias basadas en el consumo de los últimos 30 días</p>

      {/* Purchase suggestions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Sugerencia de compra (cobertura {COVERAGE_DAYS} días)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {needsBuying.length > 0 ? (
            <div className="space-y-2">
              {buyingList.visible.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded border">
                  <div>
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground text-sm ml-2">
                      ({s.current_stock} {s.unit} actual, consumo ~{s.dailyAvg.toFixed(1)} {s.unit}/día)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.daysOfStock < 2 ? 'destructive' : 'secondary'}>
                      {s.daysOfStock < 1 ? 'Urgente' : `${s.daysOfStock.toFixed(0)} días restantes`}
                    </Badge>
                    <Badge className="bg-primary/20 text-primary border-primary/30">
                      Comprar ~{Math.ceil(s.neededForCoverage)} {s.unit}
                    </Badge>
                  </div>
                </div>
              ))}
              <ShowMoreButton hiddenCount={buyingList.hiddenCount} expanded={buyingList.expanded} onToggle={() => buyingList.setExpanded(!buyingList.expanded)} />
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              {suggestions.length > 0 ? '✅ Todo el stock cubre al menos 7 días' : 'No hay datos de consumo aún. Las sugerencias aparecerán cuando se descuente stock por ventas.'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Top consumed */}
      {topConsumed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Ingredientes más consumidos (30 días)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topConsumed.map((s, idx) => (
                <div key={s.id} className="flex items-center justify-between p-2 rounded border">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-mono text-sm w-5">{idx + 1}.</span>
                    <span className="font-medium">{s.name}</span>
                  </div>
                  <span className="text-sm">{s.totalConsumed.toFixed(0)} {s.unit} consumidos</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {suggestions.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">Sin datos suficientes</p>
            <p className="text-sm">Las sugerencias inteligentes se generan a partir del historial de ventas y consumo de ingredientes.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
