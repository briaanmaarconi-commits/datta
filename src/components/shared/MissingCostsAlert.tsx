import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { money, periodLabel, useCostsSetupStatus, usePendingExpenses } from '@/lib/costs';

/**
 * Aviso de costos y gastos sin cargar (Dashboard y Rentabilidad). Sin esos datos, la rentabilidad
 * y el punto de equilibrio no son reales: el aviso lo dice y lleva directo a cargarlos.
 */
export default function MissingCostsAlert({ context = 'dashboard' }: { context?: 'dashboard' | 'profitability' }) {
  const { role } = useAuth();
  const { data: pending = [] } = usePendingExpenses();
  const { data: setup } = useCostsSetupStatus();
  const base = role === 'cashier' ? '/cashier' : '/admin';

  const nothingConfigured = !!setup && setup.recurring === 0 && setup.fixedThisMonth === 0;
  if (pending.length === 0 && !nothingConfigured) return null;

  const overdue = pending.filter(p => p.overdue);
  const names = pending.slice(0, 4).map(p => p.name).join(', ') + (pending.length > 4 ? ` y ${pending.length - 4} más` : '');
  const total = pending.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1 text-sm">
        {pending.length > 0 ? (
          <>
            <p className="font-semibold">
              Faltan confirmar {pending.length} {pending.length === 1 ? 'gasto' : 'gastos'}
              {overdue.length > 0 ? ` (algunos de ${periodLabel(overdue[0].period)})` : ''}: {names}
            </p>
            <p className="text-muted-foreground">
              {total > 0 ? `Son alrededor de ${money(total)}. ` : ''}
              {context === 'profitability' ? 'Hasta que se carguen, la rentabilidad y el punto de equilibrio no son reales.' : 'Sin esto, la rentabilidad del mes no es real.'}
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">Todavía no hay gastos fijos cargados este mes (alquiler, sueldos, servicios).</p>
            <p className="text-muted-foreground">
              {context === 'profitability' ? 'Por eso la rentabilidad aparece más alta de lo que es.' : 'Cargalos una vez y el sistema te los recuerda cada mes.'}
            </p>
          </>
        )}
      </div>
      <Button asChild size="sm" className="gap-1">
        <Link to={`${base}/costos-gastos`}>Cargar ahora <ArrowRight className="h-4 w-4" /></Link>
      </Button>
    </div>
  );
}
