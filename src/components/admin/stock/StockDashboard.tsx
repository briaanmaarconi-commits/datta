import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, XCircle, Package, ShoppingBag } from 'lucide-react';
import { formatStock } from '@/lib/stockUnits';

interface StockItem {
  id: string;
  name: string;
  current: number;
  min: number;
  unit: string;
  type: 'direct' | 'ingredient';
}

export default function StockDashboard() {
  const { establishmentId } = useAuth();

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients', establishmentId],
    queryFn: async () => {
      const { data } = await db
        .from('ingredients').select('*')
        .eq('establishment_id', establishmentId!)
        .eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const { data: directProducts = [] } = useQuery({
    queryKey: ['products-direct-stock', establishmentId],
    queryFn: async () => {
      const { data } = await db
        .from('products').select('id, name, direct_stock, direct_min_stock')
        .eq('establishment_id', establishmentId!)
        .eq('stock_mode', 'direct')
        .eq('is_available', true)
        .order('name');
      return data || [];
    },
    enabled: !!establishmentId,
  });

  // Unify both into a single list
  const allItems: StockItem[] = [
    ...directProducts.map((p: any) => ({
      id: p.id, name: p.name, current: Number(p.direct_stock), min: Number(p.direct_min_stock), unit: 'u', type: 'direct' as const,
    })),
    ...ingredients.map((i: any) => ({
      id: i.id, name: i.name, current: Number(i.current_stock), min: Number(i.min_stock), unit: i.unit, type: 'ingredient' as const,
    })),
  ];

  const critical = allItems.filter(i => i.current <= 0);
  const low = allItems.filter(i => i.current > 0 && i.current <= i.min);
  const ok = allItems.filter(i => i.current > i.min);

  const totalTracked = allItems.length;

  if (totalTracked === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No hay ítems en seguimiento</p>
          <p className="text-sm">Cargá ingredientes en "Ingredientes" y armá las recetas en "Platos y recetas". Las bebidas y postres van en "Por unidad o porción".</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard icon={<Package className="h-5 w-5 text-muted-foreground" />} value={totalTracked} label="En seguimiento" />
        <SummaryCard icon={<CheckCircle2 className="h-5 w-5 text-green-500" />} value={ok.length} label="Stock OK" />
        <SummaryCard icon={<AlertTriangle className="h-5 w-5 text-yellow-500" />} value={low.length} label="Stock bajo" />
        <SummaryCard icon={<XCircle className="h-5 w-5 text-red-500" />} value={critical.length} label="Sin stock" />
      </div>

      {/* Alerts */}
      {(critical.length > 0 || low.length > 0) && (
        <Card>
          <CardHeader><CardTitle className="text-lg">⚠️ Alertas de stock</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {critical.map(i => (
              <AlertRow key={i.id} item={i} variant="critical" />
            ))}
            {low.map(i => (
              <AlertRow key={i.id} item={i} variant="low" />
            ))}
          </CardContent>
        </Card>
      )}

      {/* OK items */}
      {ok.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">✅ Stock disponible</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {ok.map(i => (
                <div key={i.id} className="flex items-center justify-between p-2 rounded border">
                  <div className="flex items-center gap-2">
                    {i.type === 'direct' ? <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" /> : <Package className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="text-sm">{i.name}</span>
                  </div>
                  {(() => { const f = formatStock(i.current, i.unit); return (
                    <span className="text-sm text-muted-foreground">{f.value} {f.unit}</span>
                  ); })()}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertRow({ item, variant }: { item: StockItem; variant: 'critical' | 'low' }) {
  return (
    <div className={`flex items-center justify-between p-2 rounded ${variant === 'critical' ? 'bg-destructive/10' : 'bg-yellow-500/10'}`}>
      <div className="flex items-center gap-2">
        {item.type === 'direct' ? <ShoppingBag className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
        <span className="font-medium">{item.name}</span>
      </div>
      {variant === 'critical' ? (
        <Badge variant="destructive">Sin stock</Badge>
      ) : (() => {
        const cur = formatStock(item.current, item.unit);
        const min = formatStock(item.min, item.unit);
        return (
          <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">
            {cur.value} {cur.unit} (mín: {min.value} {min.unit})
          </Badge>
        );
      })()}
    </div>
  );
}
