import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Trophy, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ExpenseRow {
  name: string;
  amount: number;
}

interface Props {
  expenses: ExpenseRow[];
  totalSales: number;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#94a3b8'];

const fmt = (v: number) => `$${Math.round(v).toLocaleString('es-AR')}`;

// Recommended thresholds for restaurant industry (% of gross sales)
const THRESHOLDS: { match: RegExp; max: number; label: string }[] = [
  { match: /salario|sueldo|personal|nomina|nómina/i, max: 30, label: 'Salarios' },
  { match: /alquiler|renta|locaci/i, max: 10, label: 'Alquiler' },
  { match: /impuesto|tasa|fisc|afip|iva/i, max: 12, label: 'Impuestos' },
  { match: /marketing|publicidad/i, max: 5, label: 'Marketing' },
  { match: /servicio|luz|gas|agua|internet/i, max: 5, label: 'Servicios' },
];

export default function ExpenseBreakdownCard({ expenses, totalSales }: Props) {
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const sorted = useMemo(() => [...expenses].sort((a, b) => b.amount - a.amount), [expenses]);
  const top3 = sorted.slice(0, 3);

  const alerts = useMemo(() => {
    if (totalSales <= 0) return [];
    return sorted
      .map(e => {
        const pctSales = (e.amount / totalSales) * 100;
        const rule = THRESHOLDS.find(t => t.match.test(e.name));
        if (!rule) return null;
        return {
          name: e.name,
          pctSales,
          max: rule.max,
          label: rule.label,
          ok: pctSales <= rule.max,
        };
      })
      .filter(Boolean) as Array<{ name: string; pctSales: number; max: number; label: string; ok: boolean }>;
  }, [sorted, totalSales]);

  if (sorted.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">¿En qué se va la plata?</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-6 text-center">No hay gastos operativos registrados en este período.</p>
        </CardContent>
      </Card>
    );
  }

  const trophies = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" /> ¿En qué se va la plata?
          </CardTitle>
          <p className="text-xs text-muted-foreground">Categorías de gasto operativo ordenadas por incidencia.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Top 3 */}
          <div className="grid gap-3 sm:grid-cols-3">
            {top3.map((e, i) => {
              const pctSales = totalSales > 0 ? (e.amount / totalSales) * 100 : 0;
              return (
                <div key={e.name} className="rounded-lg border p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="text-base">{trophies[i]}</span>
                    <span className="truncate">{e.name}</span>
                  </div>
                  <div className="text-lg font-bold mt-1">{fmt(e.amount)}</div>
                  <div className="text-xs text-muted-foreground">{pctSales.toFixed(1)}% de venta</div>
                </div>
              );
            })}
          </div>

          {/* Ranking + pie chart */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              {sorted.map((e, i) => {
                const pctSales = totalSales > 0 ? (e.amount / totalSales) * 100 : 0;
                const pctExp = totalExpenses > 0 ? (e.amount / totalExpenses) * 100 : 0;
                return (
                  <div key={e.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="font-medium truncate">{e.name}</span>
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        <span className="font-semibold text-foreground">{fmt(e.amount)}</span>
                        <span className="mx-1.5">·</span>
                        {pctSales.toFixed(1)}% venta
                        <span className="mx-1.5">·</span>
                        {pctExp.toFixed(0)}% gastos
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(pctExp, 100)}%`, backgroundColor: COLORS[i % COLORS.length] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={sorted}
                    dataKey="amount"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {sorted.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Alerts */}
          {alerts.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <div className="text-xs uppercase text-muted-foreground font-medium tracking-wide">Comparación con buenas prácticas del rubro</div>
              <div className="flex flex-wrap gap-2">
                {alerts.map(a => (
                  <Badge
                    key={a.name}
                    variant="outline"
                    className={cn(
                      'gap-1.5 py-1 px-2 text-xs',
                      a.ok
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                    )}
                  >
                    {a.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    <span className="font-medium">{a.label}: {a.pctSales.toFixed(1)}%</span>
                    <span className="opacity-70">(recom. ≤{a.max}%)</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
