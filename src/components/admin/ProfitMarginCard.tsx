import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  sales: number;
  costMP: number;
  fixedExpenses: number;
  previous?: { sales: number; costMP: number; fixedExpenses: number } | null;
  highlight?: boolean;
}

const fmt = (v: number) =>
  `$${Math.round(v).toLocaleString('es-AR')}`;

const pct = (v: number, base: number) =>
  base > 0 ? ((v / base) * 100).toFixed(1) : '0.0';

export default function ProfitMarginCard({ title, sales, costMP, fixedExpenses, previous, highlight }: Props) {
  const contribution = sales - costMP;
  const profit = contribution - fixedExpenses;
  const profitPct = sales > 0 ? (profit / sales) * 100 : 0;

  let variation: number | null = null;
  if (previous) {
    const prevProfit = previous.sales - previous.costMP - previous.fixedExpenses;
    if (Math.abs(prevProfit) > 0.01) {
      variation = ((profit - prevProfit) / Math.abs(prevProfit)) * 100;
    }
  }

  return (
    <Card className={cn('overflow-hidden', highlight && 'border-primary border-2 shadow-lg')}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground flex items-center justify-between">
          <span>{title}</span>
          {variation !== null && (
            <span className={cn(
              'flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full',
              variation > 0 ? 'text-emerald-600 bg-emerald-500/10' :
              variation < 0 ? 'text-red-600 bg-red-500/10' :
              'text-muted-foreground bg-muted'
            )}>
              {variation > 0 ? <TrendingUp className="h-3 w-3" /> : variation < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {variation > 0 ? '+' : ''}{variation.toFixed(0)}%
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 text-sm">
        <div className="flex justify-between items-baseline">
          <span className="text-muted-foreground">Ventas brutas</span>
          <span className="font-semibold">{fmt(sales)}</span>
        </div>
        <div className="flex justify-between items-baseline text-red-600">
          <span>− Costo materia prima</span>
          <span className="font-semibold">{fmt(costMP)} <span className="text-xs opacity-70">({pct(costMP, sales)}%)</span></span>
        </div>
        <div className="border-t pt-2 flex justify-between items-baseline">
          <span className="font-medium">Margen contribución</span>
          <span className="font-bold text-blue-600">{fmt(contribution)} <span className="text-xs opacity-70">({pct(contribution, sales)}%)</span></span>
        </div>
        <div className="flex justify-between items-baseline text-orange-600">
          <span>− Gastos operativos</span>
          <span className="font-semibold">{fmt(fixedExpenses)} <span className="text-xs opacity-70">({pct(fixedExpenses, sales)}%)</span></span>
        </div>
        <div className={cn(
          'border-t-2 pt-2.5 flex justify-between items-baseline rounded-md px-2 -mx-2',
          profit >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
        )}>
          <span className="font-semibold">Margen de ganancia</span>
          <div className="text-right">
            <div className={cn('text-lg font-bold', profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {fmt(profit)}
            </div>
            <div className={cn('text-xs font-medium', profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {profitPct.toFixed(1)}% sobre venta
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
