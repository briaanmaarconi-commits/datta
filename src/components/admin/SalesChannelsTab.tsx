import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PLATFORM_LABELS, type DeliveryPlatform } from '@/hooks/useDeliverySettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { Store, Bike, TrendingDown } from 'lucide-react';
import { argDayRange, toArgDate } from '@/lib/utils';

const money = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

const CHANNEL_COLORS: Record<string, string> = {
  'Salón': 'hsl(var(--primary))',
  Rappi: 'hsl(var(--chart-1))',
  PedidosYa: 'hsl(var(--destructive))',
  'Delivery propio': 'hsl(var(--chart-3))',
  'Take away': 'hsl(var(--chart-4))',
};

export default function SalesChannelsTab() {
  const { establishmentId } = useAuth();
  const [days, setDays] = useState('30');

  const range = useMemo(() => {
    const to = toArgDate();
    const fromD = new Date();
    fromD.setDate(fromD.getDate() - (Number(days) - 1));
    return { fromISO: argDayRange(toArgDate(fromD)).from, toISO: argDayRange(to).to };
  }, [days]);

  const { data, isLoading } = useQuery({
    queryKey: ['sales-channels', establishmentId, range.fromISO, range.toISO],
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('id, total, channel, external_platform, platform_commission, delivery_fee, created_at')
        .eq('establishment_id', establishmentId!)
        .eq('status', 'closed')
        .gte('created_at', range.fromISO)
        .lte('created_at', range.toISO);
      if (error) throw error;

      const map: Record<string, { name: string; ventas: number; pedidos: number; comision: number }> = {};
      (orders || []).forEach((o: any) => {
        let name = 'Salón';
        if (o.channel === 'delivery') {
          const plat = (o.external_platform || 'propio') as DeliveryPlatform;
          name = PLATFORM_LABELS[plat] || 'Delivery propio';
        } else if (o.channel === 'takeaway') {
          name = 'Take away';
        }
        const row = (map[name] ||= { name, ventas: 0, pedidos: 0, comision: 0 });
        row.ventas += Number(o.total || 0);
        row.pedidos += 1;
        row.comision += Number(o.platform_commission || 0);
      });

      const rows = Object.values(map)
        .map(r => ({ ...r, neto: r.ventas - r.comision, ticket: r.pedidos ? r.ventas / r.pedidos : 0 }))
        .sort((a, b) => b.ventas - a.ventas);

      const totals = rows.reduce(
        (acc, r) => ({ ventas: acc.ventas + r.ventas, pedidos: acc.pedidos + r.pedidos, comision: acc.comision + r.comision }),
        { ventas: 0, pedidos: 0, comision: 0 }
      );
      return { rows, totals };
    },
    enabled: !!establishmentId,
    staleTime: 60_000,
  });

  const rows = data?.rows ?? [];
  const totals = data?.totals ?? { ventas: 0, pedidos: 0, comision: 0 };
  const deliveryRows = rows.filter(r => r.name !== 'Salón' && r.name !== 'Take away');
  const deliverySales = deliveryRows.reduce((s, r) => s + r.ventas, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Ventas por canal</h2>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 días</SelectItem>
            <SelectItem value="30">Últimos 30 días</SelectItem>
            <SelectItem value="90">Últimos 90 días</SelectItem>
            <SelectItem value="365">Último año</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><Store className="h-3.5 w-3.5" /> Venta total</p><p className="text-2xl font-bold mt-1">{money(totals.ventas)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><Bike className="h-3.5 w-3.5" /> Venta por delivery</p><p className="text-2xl font-bold mt-1">{money(deliverySales)}</p><p className="text-xs text-muted-foreground mt-0.5">{totals.ventas > 0 ? ((deliverySales / totals.ventas) * 100).toFixed(1) : '0'}% del total</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5" /> Comisiones</p><p className="text-2xl font-bold mt-1 text-destructive">-{money(totals.comision)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ingreso neto</p><p className="text-2xl font-bold mt-1 text-primary">{money(totals.ventas - totals.comision)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Comparación de canales</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No hay ventas en el período seleccionado.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`} />
                <Tooltip formatter={(v: number) => money(Number(v))} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Bar dataKey="ventas" radius={[6, 6, 0, 0]}>
                  {rows.map(r => <Cell key={r.name} fill={CHANNEL_COLORS[r.name] || 'hsl(var(--muted-foreground))'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Detalle por canal</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Canal</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Venta bruta</TableHead>
                <TableHead className="text-right">Comisión</TableHead>
                <TableHead className="text-right">Ingreso neto</TableHead>
                <TableHead className="text-right">Ticket promedio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.name}>
                  <TableCell>
                    <Badge variant="outline" style={{ borderColor: CHANNEL_COLORS[r.name], color: CHANNEL_COLORS[r.name] }}>{r.name}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{r.pedidos}</TableCell>
                  <TableCell className="text-right font-medium">{money(r.ventas)}</TableCell>
                  <TableCell className="text-right text-destructive">{r.comision > 0 ? `-${money(r.comision)}` : '—'}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{money(r.neto)}</TableCell>
                  <TableCell className="text-right">{money(r.ticket)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sin datos</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
