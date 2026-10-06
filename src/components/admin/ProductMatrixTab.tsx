import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ZAxis, Cell,
} from 'recharts';
import { Star, Cog, HelpCircle, AlertTriangle, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { argDayRange, toArgDate } from '@/lib/utils';

type Quadrant = 'star' | 'cow' | 'dilemma' | 'dog';

interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  units: number;
  revenue: number;
  unitMargin: number;
  totalMargin: number;
  marginPct: number;
  quadrant: Quadrant;
}

const QUADRANT_META: Record<Quadrant, { label: string; color: string; icon: any; tip: string; reco: string }> = {
  star:    { label: 'Estrella',  color: '#22c55e', icon: Star,          tip: 'Alto volumen + alto margen', reco: 'Destacar en menú y promocionar' },
  cow:     { label: 'Vaca',      color: '#3b82f6', icon: Cog,           tip: 'Alto volumen, margen bajo',  reco: 'Renegociar costo o subir precio leve' },
  dilemma: { label: 'Dilema',    color: '#f59e0b', icon: HelpCircle,    tip: 'Bajo volumen, alto margen',  reco: 'Impulsar venta sugerida' },
  dog:     { label: 'Perro',     color: '#ef4444', icon: AlertTriangle, tip: 'Bajo volumen y bajo margen', reco: 'Evaluar quitar del menú' },
};

export default function ProductMatrixTab() {
  const { establishmentId } = useAuth();
  const [days, setDays] = useState('30');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showAllProducts, setShowAllProducts] = useState(false);

  const range = useMemo(() => {
    const n = parseInt(days, 10);
    const today = toArgDate();
    const fromD = new Date();
    fromD.setDate(fromD.getDate() - (n - 1));
    const fromDate = toArgDate(fromD);
    return {
      fromISO: argDayRange(fromDate).from,
      toISO: argDayRange(today).to,
    };
  }, [days]);

  const { data, isLoading } = useQuery({
    queryKey: ['product-matrix', establishmentId, range.fromISO, range.toISO],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { data: items, error } = await db
        .from('order_items')
        .select(`
          quantity, unit_price, cost_snapshot,
          products!inner(id, name, categories(name)),
          orders!inner(id, status, establishment_id, created_at)
        `)
        .eq('orders.establishment_id', establishmentId!)
        .eq('orders.status', 'closed')
        .gte('orders.created_at', range.fromISO)
        .lte('orders.created_at', range.toISO);
      if (error) throw error;

      const map = new Map<string, ProductRow>();
      for (const it of items as any[]) {
        const p = it.products;
        if (!p) continue;
        const key = p.id;
        const qty = Number(it.quantity ?? 0);
        const price = Number(it.unit_price ?? 0);
        const cost = Number(it.cost_snapshot ?? 0);
        const rev = qty * price;
        const margin = qty * (price - cost);
        const row = map.get(key) ?? {
          id: p.id,
          name: p.name,
          category: p.categories?.name ?? null,
          units: 0,
          revenue: 0,
          unitMargin: 0,
          totalMargin: 0,
          marginPct: 0,
          quadrant: 'dog' as Quadrant,
        };
        row.units += qty;
        row.revenue += rev;
        row.totalMargin += margin;
        map.set(key, row);
      }

      const rows = Array.from(map.values()).map((r) => ({
        ...r,
        unitMargin: r.units > 0 ? r.totalMargin / r.units : 0,
        marginPct: r.revenue > 0 ? (r.totalMargin / r.revenue) * 100 : 0,
      }));

      if (rows.length === 0) return { rows: [], unitsMedian: 0, marginMedian: 0 };

      const sortedUnits = [...rows].map((r) => r.units).sort((a, b) => a - b);
      const sortedMargin = [...rows].map((r) => r.marginPct).sort((a, b) => a - b);
      const median = (arr: number[]) => arr[Math.floor(arr.length / 2)] ?? 0;
      const unitsMedian = median(sortedUnits);
      const marginMedian = median(sortedMargin);

      for (const r of rows) {
        const hiVol = r.units >= unitsMedian;
        const hiMar = r.marginPct >= marginMedian;
        r.quadrant = hiVol && hiMar ? 'star'
                    : hiVol && !hiMar ? 'cow'
                    : !hiVol && hiMar ? 'dilemma'
                    : 'dog';
      }

      return { rows, unitsMedian, marginMedian };
    },
  });

  const categories = useMemo(() => {
    const s = new Set<string>();
    data?.rows.forEach((r) => r.category && s.add(r.category));
    return Array.from(s).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return categoryFilter === 'all'
      ? data.rows
      : data.rows.filter((r) => r.category === categoryFilter);
  }, [data, categoryFilter]);

  const grouped = useMemo(() => {
    const g: Record<Quadrant, ProductRow[]> = { star: [], cow: [], dilemma: [], dog: [] };
    filtered.forEach((r) => g[r.quadrant].push(r));
    return g;
  }, [filtered]);

  const scatterData = filtered.map((r) => ({ ...r, z: Math.max(r.revenue, 1) }));

  const sortedProducts = [...filtered].sort((a, b) => b.totalMargin - a.totalMargin);
  const visibleProducts = showAllProducts ? sortedProducts : sortedProducts.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 días</SelectItem>
            <SelectItem value="30">Últimos 30 días</SelectItem>
            <SelectItem value="90">Últimos 90 días</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(QUADRANT_META) as Quadrant[]).map((q) => {
          const meta = QUADRANT_META[q];
          const Icon = meta.icon;
          return (
            <Card key={q}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4" style={{ color: meta.color }} />
                  <span className="font-medium">{meta.label}</span>
                </div>
                <div className="text-2xl font-bold">{grouped[q].length}</div>
                <p className="text-xs text-muted-foreground">{meta.tip}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Matriz Volumen × Margen</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">Sin ventas en el período</div>
          ) : (
            <ResponsiveContainer width="100%" height={420}>
              <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  type="number"
                  dataKey="units"
                  name="Unidades"
                  label={{ value: 'Unidades vendidas', position: 'insideBottom', offset: -10 }}
                />
                <YAxis
                  type="number"
                  dataKey="marginPct"
                  name="Margen %"
                  unit="%"
                  label={{ value: 'Margen %', angle: -90, position: 'insideLeft' }}
                />
                <ZAxis dataKey="z" range={[60, 400]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const p = payload[0].payload as ProductRow;
                    const meta = QUADRANT_META[p.quadrant];
                    return (
                      <div className="bg-popover border rounded-md p-2 text-xs shadow-md">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-muted-foreground">{p.category}</div>
                        <div>Unidades: <b>{p.units}</b></div>
                        <div>Margen: <b>{p.marginPct.toFixed(1)}%</b></div>
                        <div>Ingreso: <b>${p.revenue.toFixed(0)}</b></div>
                        <Badge style={{ background: meta.color }} className="mt-1 text-white">{meta.label}</Badge>
                      </div>
                    );
                  }}
                />
                <ReferenceLine x={data?.unitsMedian ?? 0} stroke="#94a3b8" strokeDasharray="4 4" />
                <ReferenceLine y={data?.marginMedian ?? 0} stroke="#94a3b8" strokeDasharray="4 4" />
                <Scatter data={scatterData}>
                  {scatterData.map((p, i) => (
                    <Cell key={i} fill={QUADRANT_META[p.quadrant].color} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ranking de productos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">Margen unit.</TableHead>
                  <TableHead className="text-right">Margen total</TableHead>
                  <TableHead className="text-right">Margen %</TableHead>
                  <TableHead>Cuadrante</TableHead>
                  <TableHead>Recomendación IA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleProducts.map((r) => {
                  const meta = QUADRANT_META[r.quadrant];
                  return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-muted-foreground">{r.category ?? '—'}</TableCell>
                        <TableCell className="text-right">{r.units}</TableCell>
                        <TableCell className="text-right">${r.unitMargin.toFixed(0)}</TableCell>
                        <TableCell className="text-right">${r.totalMargin.toFixed(0)}</TableCell>
                        <TableCell className="text-right">{r.marginPct.toFixed(1)}%</TableCell>
                        <TableCell>
                          <Badge style={{ background: meta.color }} className="text-white">{meta.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-primary" />{meta.reco}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
          {sortedProducts.length > 10 && (
            <div className="flex justify-center mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowAllProducts(v => !v)} className="gap-1">
                {showAllProducts
                  ? <>Ver menos <ChevronUp className="h-4 w-4" /></>
                  : <>Ver más ({sortedProducts.length - 10}) <ChevronDown className="h-4 w-4" /></>}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
