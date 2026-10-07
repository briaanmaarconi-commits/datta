import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface MonthlyPoint {
  label: string;
  sales: number;
  costMP: number;
  fixedExpenses: number;
}

interface Props {
  periodLabel: string;
  sales: number;
  costMP: number;
  fixedExpenses: number;
  daysInPeriod: number;
  monthly: MonthlyPoint[];
}

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-AR')}`;

export default function BreakEvenCard({ periodLabel, sales, costMP, fixedExpenses, daysInPeriod, monthly }: Props) {
  const cmRatio = sales > 0 ? (sales - costMP) / sales : 0;
  const breakEven = cmRatio > 0 ? fixedExpenses / cmRatio : 0;
  const diff = sales - breakEven;
  const progressPct = breakEven > 0 ? Math.min((sales / breakEven) * 100, 200) : sales > 0 ? 100 : 0;

  // Normalized to monthly (30 days) for sub-period mini cards
  const monthlyBE = daysInPeriod > 0 ? (breakEven / daysInPeriod) * 30 : 0;

  const monthlyChartMax = useMemo(() => {
    if (monthly.length === 0) return 0;
    return Math.max(...monthly.map(m => m.sales), monthlyBE);
  }, [monthly, monthlyBE]);

  // Status
  let statusVariant: 'good' | 'warning' | 'bad' = 'bad';
  if (sales >= breakEven && breakEven > 0) statusVariant = 'good';
  else if (sales >= breakEven * 0.85) statusVariant = 'warning';

  if (cmRatio <= 0 && sales > 0) {
    return (
      <Card className="border-red-500/40 border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" /> Punto de equilibrio inalcanzable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tu costo de materia prima ({fmt(costMP)}) supera o iguala tus ventas ({fmt(sales)}).
            No es posible alcanzar punto de equilibrio sin ajustar precios o reducir costos de insumos.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main break-even card */}
      <Card className={cn(
        'border-2',
        statusVariant === 'good' && 'border-emerald-500/40 bg-emerald-500/5',
        statusVariant === 'warning' && 'border-yellow-500/40 bg-yellow-500/5',
        statusVariant === 'bad' && 'border-red-500/40 bg-red-500/5',
        
      )}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <Target className="h-4 w-4" /> Punto de equilibrio — {periodLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-3">
            <div className="text-4xl md:text-5xl font-bold tracking-tight">{fmt(breakEven)}</div>
            <div className="text-sm text-muted-foreground mt-1">Ventas mínimas para no perder plata</div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Ventas actuales: <span className="font-semibold text-foreground">{fmt(sales)}</span></span>
              <span className="font-semibold">{progressPct.toFixed(0)}%</span>
            </div>
            <div className="relative w-full bg-muted rounded-full h-4 overflow-hidden">
              <div
                className={cn(
                  'h-4 rounded-full transition-all',
                  statusVariant === 'good' && 'bg-emerald-500',
                  statusVariant === 'warning' && 'bg-yellow-500',
                  statusVariant === 'bad' && 'bg-red-500'
                )}
                style={{ width: `${Math.min(progressPct, 100)}%` }}
              />
              {breakEven > 0 && progressPct > 100 && (
                <div className="absolute top-0 right-0 h-4 px-2 flex items-center text-[10px] font-bold text-white bg-emerald-700 rounded-r-full">
                  +{(progressPct - 100).toFixed(0)}%
                </div>
              )}
            </div>
          </div>

          {statusVariant === 'good' && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="text-sm">
                <strong>Superaste el punto de equilibrio por {fmt(diff)}</strong>
                <div className="text-xs opacity-80">Estás ganando dinero en este período.</div>
              </div>
            </div>
          )}
          {statusVariant === 'warning' && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="text-sm">
                <strong>Te faltan {fmt(-diff)} para llegar al punto de equilibrio</strong>
                <div className="text-xs opacity-80">Estás cerca, un pequeño empujón te lleva a ganancia.</div>
              </div>
            </div>
          )}
          {statusVariant === 'bad' && sales > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-red-500/10 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="text-sm">
                <strong>Estás perdiendo {fmt(-diff)} en este período</strong>
                <div className="text-xs opacity-80">Necesitás aumentar ventas o reducir gastos.</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mini cards: per day / week / month */}
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { label: 'Por día', value: monthlyBE / 30 },
          { label: 'Por semana', value: monthlyBE / 4.33 },
          { label: 'Por mes', value: monthlyBE },
        ].map(item => (
          <Card key={item.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{fmt(item.value)}</div>
              <div className="text-xs text-muted-foreground">para empatar</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly chart vs break-even */}
      {monthly.length > 0 && monthlyBE > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ventas vs Punto de equilibrio (12 meses)</CardTitle>
            <p className="text-xs text-muted-foreground">Línea roja: punto de equilibrio mensual estimado del período actual.</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                <Tooltip
                  formatter={(v: number) => `$${v.toLocaleString('es-AR')}`}
                  labelFormatter={(l) => `${l}`}
                />
                <ReferenceLine y={monthlyBE} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Punto eq.', position: 'right', fill: '#ef4444', fontSize: 11 }} />
                <Bar dataKey="sales" name="Ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
