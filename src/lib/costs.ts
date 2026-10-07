import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';

// Costos y gastos del local (ver backend/sql/111_costs_expenses.sql).

export type ExpenseKind = 'cogs' | 'fixed' | 'variable';
export const KIND_LABEL: Record<ExpenseKind, string> = { cogs: 'Mercadería', fixed: 'Gastos fijos', variable: 'Gastos variables' };
export const KIND_HINT: Record<ExpenseKind, string> = {
  cogs: 'Materia prima, bebidas, descartables',
  fixed: 'Alquiler, sueldos, servicios, impuestos',
  variable: 'Comisiones, delivery, publicidad, arreglos',
};

export interface ExpenseCategory { id: string; name: string; kind: ExpenseKind | null }
export interface PendingExpense {
  recurring_expense_id: string; name: string; category_id: string; category_name: string;
  amount: number; day_of_month: number; period: string; overdue: boolean;
}

export const COSTS_KEY = ['costs'] as const;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const periodLabel = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
export const money = (n: number) => `$${Math.round(Number(n || 0)).toLocaleString('es-AR')}`;

/** Categorías de egreso (si el local no tiene ninguna, se crean las de siempre). */
export function useExpenseCategories() {
  const { establishmentId } = useAuth();
  return useQuery({
    queryKey: [...COSTS_KEY, 'categories', establishmentId],
    enabled: !!establishmentId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const load = async () => {
        const { data, error } = await db.from('finance_categories').select('id, name, kind')
          .eq('establishment_id', establishmentId!).eq('type', 'expense').order('name');
        if (error) throw error;
        return (data ?? []) as ExpenseCategory[];
      };
      let cats = await load();
      if (!cats.some(c => c.name === 'Alquiler') || !cats.some(c => c.name === 'Bebidas')) {
        await db.rpc('seed_default_finance_categories', { _establishment_id: establishmentId! });
        cats = await load();
      }
      // Las categorías internas (propinas, cortesías) no se cargan a mano.
      return cats.filter(c => c.kind !== null);
    },
  });
}

/** Gastos fijos pendientes de confirmar (mes pasado sin confirmar y los de este mes que ya vencieron). */
export function usePendingExpenses() {
  const { establishmentId } = useAuth();
  return useQuery({
    queryKey: [...COSTS_KEY, 'pending', establishmentId],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { data, error } = await db.rpc('pending_recurring_expenses' as any, { _establishment_id: establishmentId! });
      if (error) throw error;
      return ((data ?? []) as PendingExpense[]).map(p => ({ ...p, amount: Number(p.amount) }));
    },
  });
}

/** ¿Se cargó algún gasto fijo este mes o hay gastos fijos agendados? (para avisar si no hay nada). */
export function useCostsSetupStatus() {
  const { establishmentId } = useAuth();
  return useQuery({
    queryKey: [...COSTS_KEY, 'setup', establishmentId],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { count: recurring } = await db.from('recurring_expenses').select('id', { count: 'exact', head: true })
        .eq('establishment_id', establishmentId!).eq('is_active', true);
      const monthStart = new Date().toISOString().slice(0, 8) + '01';
      const { data: fixed } = await db.from('finance_transactions').select('id, finance_categories!inner(kind)')
        .eq('establishment_id', establishmentId!).eq('type', 'expense').gte('date', monthStart)
        .eq('finance_categories.kind', 'fixed').limit(1);
      return { recurring: recurring ?? 0, fixedThisMonth: (fixed ?? []).length };
    },
  });
}
