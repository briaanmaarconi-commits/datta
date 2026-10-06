import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Heart, TrendingUp, TrendingDown, Minus } from 'lucide-react';

type Health = {
  score: number;
  sales_week: number;
  sales_prev: number;
  orders_week: number;
  orders_prev: number;
  avg_ticket_week: number;
  avg_ticket_prev: number;
  cost_week: number;
  expenses_week: number;
  active_tables: number;
  total_tables: number;
  sub_scores: { growth: number; ticket: number; cost: number; occupancy: number };
};

function ars(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}
function pct(curr: number, prev: number) {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

function scoreColor(s: number) {
  if (s >= 75) return 'text-emerald-500';
  if (s >= 50) return 'text-yellow-500';
  return 'text-destructive';
}
function scoreLabel(s: number) {
  if (s >= 85) return 'Excelente';
  if (s >= 70) return 'Saludable';
  if (s >= 50) return 'Atención';
  if (s >= 30) return 'Riesgo';
  return 'Crítico';
}

export default function HealthScoreCard() {
  const { establishmentId } = useAuth();
  const { data } = useQuery({
    queryKey: ['business-health', establishmentId],
    enabled: !!establishmentId,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('get_business_health', { _establishment_id: establishmentId! });
      if (error) throw error;
      return data as unknown as Health;
    },
  });

  const insights = useMemo(() => {
    if (!data) return { good: [] as string[], watch: [] as string[] };
    const good: string[] = [];
    const watch: string[] = [];
    const sub = data.sub_scores;
    if (sub.growth >= 70) good.push('Ventas creciendo respecto a la semana anterior.');
    else if (sub.growth < 40) watch.push('Las ventas bajaron vs la semana pasada.');
    if (sub.ticket >= 70) good.push('Ticket promedio en alza.');
    else if (sub.ticket < 40) watch.push('Ticket promedio en baja.');
    if (sub.cost >= 60) good.push('Costos bajo control respecto a las ventas.');
    else if (sub.cost < 40) watch.push('Los costos/gastos están comiendo el margen.');
    if (sub.occupancy >= 70) good.push('Buena ocupación de mesas en este momento.');
    else if (sub.occupancy < 25 && data.total_tables > 0) watch.push('Mesas con baja ocupación ahora.');
    if (good.length === 0 && watch.length === 0) good.push('Necesitás más datos para un diagnóstico fino.');
    return { good, watch };
  }, [data]);

  const score = data?.score ?? 0;
  const salesDelta = data ? pct(Number(data.sales_week), Number(data.sales_prev)) : null;
  const ticketDelta = data ? pct(Number(data.avg_ticket_week), Number(data.avg_ticket_prev)) : null;

  const DeltaIcon = ({ v }: { v: number | null }) =>
    v === null ? <Minus className="h-3 w-3" /> : v >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex items-center gap-4 md:w-[260px]">
            <div className="relative h-24 w-24 shrink-0">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="42" className="stroke-muted" strokeWidth="10" fill="none" />
                <circle
                  cx="50" cy="50" r="42"
                  className={scoreColor(score)}
                  strokeWidth="10"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${(score / 100) * 264} 264`}
                  stroke="currentColor"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-bold ${scoreColor(score)}`}>{score}</span>
                <span className="text-[10px] text-muted-foreground">/ 100</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Heart className="h-3.5 w-3.5" /> Salud del negocio
              </div>
              <div className={`text-lg font-semibold ${scoreColor(score)}`}>{scoreLabel(score)}</div>
              <div className="text-xs text-muted-foreground mt-1">Últimos 7 días vs 7 anteriores</div>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Crecimiento" value={data?.sub_scores.growth ?? 0} hint={salesDelta} hintFmt="pct" Icon={DeltaIcon} />
            <Metric label="Ticket prom." value={data?.sub_scores.ticket ?? 0} hint={ticketDelta} hintFmt="pct" Icon={DeltaIcon} />
            <Metric label="Costos" value={data?.sub_scores.cost ?? 0} hint={data ? Number(data.cost_week) + Number(data.expenses_week) : 0} hintFmt="ars" />
            <Metric label="Ocupación" value={data?.sub_scores.occupancy ?? 0} hint={data ? `${data.active_tables}/${data.total_tables}` : '0/0'} hintFmt="raw" />
          </div>
        </div>

        {(insights.good.length > 0 || insights.watch.length > 0) && (
          <div className="grid md:grid-cols-2 gap-3 mt-5 text-sm">
            {insights.good.length > 0 && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                <p className="font-medium text-emerald-500 text-xs mb-1">QUÉ VA BIEN</p>
                <ul className="space-y-0.5 text-foreground/90">
                  {insights.good.map((t, i) => <li key={i}>• {t}</li>)}
                </ul>
              </div>
            )}
            {insights.watch.length > 0 && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2">
                <p className="font-medium text-yellow-500 text-xs mb-1">PARA REVISAR</p>
                <ul className="space-y-0.5 text-foreground/90">
                  {insights.watch.map((t, i) => <li key={i}>• {t}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  function Metric({ label, value, hint, hintFmt, Icon }: { label: string; value: number; hint: any; hintFmt: 'pct' | 'ars' | 'raw'; Icon?: any }) {
    const hintText =
      hint === null || hint === undefined
        ? '—'
        : hintFmt === 'pct'
          ? `${Number(hint).toFixed(0)}%`
          : hintFmt === 'ars'
            ? ars(Number(hint))
            : String(hint);
    return (
      <div className="rounded-md border bg-card/50 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">{label}</span>
          <span className={`text-xs font-semibold ${scoreColor(value)}`}>{value}</span>
        </div>
        <Progress value={value} className="h-1.5 my-1.5" />
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {Icon && hintFmt === 'pct' && <Icon v={typeof hint === 'number' ? hint : null} />}
          <span>{hintText}</span>
        </div>
      </div>
    );
  }
}
