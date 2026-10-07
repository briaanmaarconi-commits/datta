import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Repeat, Sparkles, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { parseAmount } from '@/lib/parseAmount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  COSTS_KEY, KIND_HINT, KIND_LABEL, money, periodLabel, useExpenseCategories, usePendingExpenses,
  type ExpenseCategory, type ExpenseKind, type PendingExpense,
} from '@/lib/costs';

type Money = 'cash' | 'other';
const KINDS: ExpenseKind[] = ['cogs', 'fixed', 'variable'];
const today = () => new Date().toISOString().slice(0, 10);
const thisPeriod = () => today().slice(0, 7);
const shiftPeriod = (p: string, d: number) => {
  const dt = new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1 + d, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};

interface Tx {
  id: string; amount: number; date: string; description: string | null; affects_cash: boolean;
  recurring_expense_id: string | null; finance_categories: { name: string; kind: ExpenseKind | null } | null;
}

/** Costos y gastos: un solo lugar para cargar todos los egresos del local (admin y cajero). */
export default function CostsExpenses() {
  const { establishmentId, role } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === 'admin';
  const [period, setPeriod] = useState(thisPeriod());
  const [dialog, setDialog] = useState<{ pending?: PendingExpense } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const { data: categories = [] } = useExpenseCategories();
  const { data: pending = [] } = usePendingExpenses();

  const { data: recurringCount = 0 } = useQuery({
    queryKey: [...COSTS_KEY, 'recurring-count', establishmentId],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { count } = await db.from('recurring_expenses').select('id', { count: 'exact', head: true })
        .eq('establishment_id', establishmentId!).eq('is_active', true);
      return count ?? 0;
    },
  });

  const { data: txs = [], isLoading } = useQuery({
    queryKey: [...COSTS_KEY, 'month', establishmentId, period],
    enabled: !!establishmentId,
    queryFn: async () => {
      const from = `${period}-01`;
      const to = `${shiftPeriod(period, 1)}-01`;
      const { data, error } = await db.from('finance_transactions')
        .select('id, amount, date, description, affects_cash, recurring_expense_id, finance_categories(name, kind)')
        .eq('establishment_id', establishmentId!).eq('type', 'expense').gte('date', from).lt('date', to)
        .order('date', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      // Propinas y cortesías son movimientos internos: no son costos ni gastos del local.
      return ((data ?? []) as Tx[]).filter(t => t.finance_categories?.kind);
    },
  });

  // Tiempo real: lo que cargue otro (el cajero, una compra de Stock) aparece solo.
  useEffect(() => {
    if (!establishmentId) return;
    const ch = db.channel(`costs-${establishmentId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_expenses', filter: `establishment_id=eq.${establishmentId}` },
        () => queryClient.invalidateQueries({ queryKey: COSTS_KEY }))
      .subscribe();
    return () => {
      db.removeChannel(ch);
    };
  }, [establishmentId, queryClient]);

  const totals = useMemo(() => {
    const t: Record<ExpenseKind, number> = { cogs: 0, fixed: 0, variable: 0 };
    for (const x of txs) if (x.finance_categories?.kind) t[x.finance_categories.kind] += Number(x.amount);
    return t;
  }, [txs]);

  const skip = useMutation({
    mutationFn: async (p: PendingExpense) => {
      const { error } = await db.from('recurring_expense_skips').insert({ recurring_expense_id: p.recurring_expense_id, period: p.period } as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COSTS_KEY }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('finance_transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Gasto eliminado');
      queryClient.invalidateQueries({ queryKey: COSTS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    // pb: los botones flotantes no tapan la lista en el celular.
    <div className="space-y-6 pb-28 lg:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Costos y gastos</h1>
          <p className="mt-1 text-muted-foreground">Cargá acá todo lo que sale del local. Con esto la rentabilidad y el punto de equilibrio son reales.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setRecurringOpen(true)}><Repeat className="h-4 w-4" />Gastos fijos</Button>
          <Button className="gap-2" onClick={() => setDialog({})}><Plus className="h-4 w-4" />Cargar gasto</Button>
        </div>
      </div>

      {recurringCount === 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <Sparkles className="h-6 w-6 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Configurá tus gastos fijos en 2 minutos</p>
              <p className="text-sm text-muted-foreground">Decinos cuánto pagás de alquiler, sueldos, luz, etc. Cada mes el sistema te pregunta si ya los pagaste y los confirmás con un toque.</p>
            </div>
            <Button onClick={() => setSetupOpen(true)}>Empezar</Button>
          </CardContent>
        </Card>
      )}

      {pending.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-5 w-5 text-amber-600" />Para confirmar ({pending.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pending.map(p => (
              <div key={`${p.recurring_expense_id}-${p.period}`} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.name} <span className="font-normal text-muted-foreground">· {periodLabel(p.period)}</span></p>
                  <p className="text-xs text-muted-foreground">{p.overdue ? 'Del mes pasado, sin confirmar' : `Se paga el día ${p.day_of_month}`} · monto habitual {money(p.amount)}</p>
                </div>
                <Button size="sm" onClick={() => setDialog({ pending: p })}>¿Ya lo pagaste?</Button>
                <Button size="sm" variant="ghost" disabled={skip.isPending} onClick={() => skip.mutate(p)}>Este mes no</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setPeriod(p => shiftPeriod(p, -1))} aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-[150px] text-center font-semibold capitalize">{periodLabel(period)}</span>
        <Button variant="outline" size="icon" disabled={period >= thisPeriod()} onClick={() => setPeriod(p => shiftPeriod(p, 1))} aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KINDS.map(k => (
          <Card key={k}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{KIND_LABEL[k]}</p>
              <p className="mt-1 text-2xl font-bold">{money(totals[k])}</p>
              <p className="text-xs text-muted-foreground">{KIND_HINT[k]}</p>
            </CardContent>
          </Card>
        ))}
        <Card className="border-primary/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total del mes</p>
            <p className="mt-1 text-2xl font-bold">{money(totals.cogs + totals.fixed + totals.variable)}</p>
            <p className="text-xs text-muted-foreground">{txs.length} {txs.length === 1 ? 'egreso' : 'egresos'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Egresos de {periodLabel(period)}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : txs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No hay egresos cargados en este mes.</p>
          ) : (
            <div className="divide-y">
              {txs.map(t => {
                const fromStock = (t.description ?? '').startsWith('Compra:');
                return (
                  <div key={t.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <span className="w-20 shrink-0 text-muted-foreground">{t.date.slice(8, 10)}/{t.date.slice(5, 7)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{t.finance_categories?.name}</p>
                      {t.description && <p className="truncate text-xs text-muted-foreground">{t.description}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {t.finance_categories?.kind && <Badge variant="outline" className="text-[11px]">{KIND_LABEL[t.finance_categories.kind]}</Badge>}
                      {fromStock && <Badge variant="secondary" className="text-[11px]">Desde Stock</Badge>}
                      {t.recurring_expense_id && <Badge variant="secondary" className="text-[11px]">Fijo</Badge>}
                      <Badge variant="outline" className={cn('text-[11px]', t.affects_cash && 'border-primary/40 text-primary')}>{t.affects_cash ? 'Caja del turno' : 'Otra plata'}</Badge>
                    </div>
                    <span className="w-28 text-right font-semibold">{money(t.amount)}</span>
                    {isAdmin && !fromStock && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Eliminar"
                        onClick={() => { if (confirm('¿Eliminar este gasto?')) remove.mutate(t.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!isAdmin && txs.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Si cargaste algo mal, avisale al administrador: solo él puede borrar gastos.</p>}
        </CardContent>
      </Card>

      <ExpenseDialog
        open={!!dialog}
        pending={dialog?.pending}
        categories={categories}
        onClose={() => setDialog(null)}
      />
      <FixedSetupDialog open={setupOpen} onOpenChange={setSetupOpen} categories={categories} />
      <RecurringDialog open={recurringOpen} onOpenChange={setRecurringOpen} categories={categories} onSetup={() => { setRecurringOpen(false); setSetupOpen(true); }} />
    </div>
  );
}

function MoneySource({ value, onChange }: { value: Money | null; onChange: (v: Money) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>¿Con qué plata se pagó?</Label>
      <div className="grid gap-2 sm:grid-cols-2">
        {([['cash', 'Efectivo de la caja del turno', 'Se descuenta del efectivo esperado de la caja'],
          ['other', 'Otra plata', 'Transferencia, cuenta del local o la pagó el dueño']] as const).map(([v, title, hint]) => (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={cn('rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/50', value === v && 'border-primary bg-primary/5 ring-1 ring-primary')}>
            <span className="block font-medium">{title}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Cargar un gasto (o confirmar uno fijo del mes). */
function ExpenseDialog({ open, pending, categories, onClose }: {
  open: boolean; pending?: PendingExpense; categories: ExpenseCategory[]; onClose: () => void;
}) {
  const { establishmentId, user } = useAuth();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ExpenseKind>('cogs');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<Money | null>(null);
  const [repeat, setRepeat] = useState(false);
  const [day, setDay] = useState('10');

  useEffect(() => {
    if (!open) return;
    if (pending) {
      setCategoryId(pending.category_id);
      setKind(categories.find(c => c.id === pending.category_id)?.kind ?? 'fixed');
      setAmount(String(pending.amount || ''));
      setDescription(`${pending.name} de ${periodLabel(pending.period)}`);
    } else {
      setCategoryId('');
      setAmount('');
      setDescription('');
    }
    setDate(today());
    setSource(pending ? 'other' : null);
    setRepeat(false);
  }, [open, pending, categories]);

  const value = parseAmount(amount) || 0;
  const save = useMutation({
    mutationFn: async () => {
      let recurringId = pending?.recurring_expense_id ?? null;
      const cat = categories.find(c => c.id === categoryId);
      if (!pending && repeat && cat) {
        const { data, error } = await db.from('recurring_expenses').insert({
          establishment_id: establishmentId!, category_id: categoryId, name: cat.name, amount: value,
          day_of_month: Math.min(28, Math.max(1, Number(day) || 1)), created_by: user?.id ?? null,
        } as any).select('id').single();
        if (error) throw error;
        recurringId = (data as any).id;
      }
      const { error } = await db.from('finance_transactions').insert({
        establishment_id: establishmentId!, category_id: categoryId, type: 'expense', amount: value, date,
        description: description.trim() || null, affects_cash: source === 'cash', created_by: user?.id ?? null,
        recurring_expense_id: recurringId, period: recurringId ? (pending?.period ?? date.slice(0, 7)) : null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(pending ? `${pending.name} confirmado` : 'Gasto cargado');
      queryClient.invalidateQueries({ queryKey: COSTS_KEY });
      queryClient.invalidateQueries({ queryKey: ['profit-margin'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo guardar'),
  });

  const visible = categories.filter(c => c.kind === kind);
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !save.isPending) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pending ? `¿Pagaste ${pending.name.toLowerCase()} de ${periodLabel(pending.period)}?` : 'Cargar un gasto'}</DialogTitle>
          <DialogDescription>{pending ? 'Revisá el monto: si cambió este mes, corregilo.' : 'Elegí qué pagaste, cuánto y con qué plata.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!pending && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {KINDS.map(k => (
                  <button key={k} type="button" onClick={() => { setKind(k); setCategoryId(''); }}
                    className={cn('rounded-lg border p-2 text-left text-sm hover:bg-muted/50', kind === k && 'border-primary bg-primary/5 ring-1 ring-primary')}>
                    <span className="block font-medium">{KIND_LABEL[k]}</span>
                    <span className="hidden text-xs text-muted-foreground sm:block">{KIND_HINT[k]}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {visible.map(c => (
                  <Button key={c.id} type="button" size="sm" variant={categoryId === c.id ? 'default' : 'outline'} onClick={() => setCategoryId(c.id)}>{c.name}</Button>
                ))}
              </div>
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="e-amount">Monto</Label>
              <Input id="e-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ej: 85000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-date">Fecha</Label>
              <Input id="e-date" type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-desc">Detalle (opcional)</Label>
            <Textarea id="e-desc" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: verdulería del barrio, factura 0001-2345" />
          </div>
          <MoneySource value={source} onChange={setSource} />
          {!pending && kind !== 'cogs' && (
            <label className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
              <Checkbox checked={repeat} onCheckedChange={v => setRepeat(v === true)} />
              <span>Se repite todos los meses. El sistema pregunta el día</span>
              <Input className="h-8 w-16" inputMode="numeric" value={day} onChange={e => setDay(e.target.value)} disabled={!repeat} aria-label="Día del mes" />
              <span>si ya se pagó.</span>
            </label>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancelar</Button>
          <Button disabled={!categoryId || !(value > 0) || !source || save.isPending} onClick={() => save.mutate()} className="gap-2">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{pending ? 'Confirmar pago' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Configuración inicial: los gastos fijos típicos con su monto y día de pago. */
function FixedSetupDialog({ open, onOpenChange, categories }: { open: boolean; onOpenChange: (o: boolean) => void; categories: ExpenseCategory[] }) {
  const { establishmentId, user } = useAuth();
  const queryClient = useQueryClient();
  const fixed = categories.filter(c => c.kind === 'fixed');
  const [rows, setRows] = useState<Record<string, { amount: string; day: string }>>({});
  useEffect(() => {
    if (open) setRows(Object.fromEntries(fixed.map(c => [c.id, { amount: '', day: '10' }])));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const filled = fixed.filter(c => (parseAmount(rows[c.id]?.amount ?? '') || 0) > 0);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('recurring_expenses').insert(filled.map(c => ({
        establishment_id: establishmentId!, category_id: c.id, name: c.name, amount: parseAmount(rows[c.id].amount) || 0,
        day_of_month: Math.min(28, Math.max(1, Number(rows[c.id].day) || 1)), created_by: user?.id ?? null,
      })) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Listo: ${filled.length} gastos fijos agendados. Cada mes te vamos a preguntar si ya los pagaste.`);
      queryClient.invalidateQueries({ queryKey: COSTS_KEY });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tus gastos fijos</DialogTitle>
          <DialogDescription>Completá solo los que tenés, con el monto aproximado y el día que se pagan. Lo que no uses, dejalo vacío.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_140px_80px] gap-2 px-1 text-xs text-muted-foreground"><span>Gasto</span><span>Monto por mes</span><span>Día</span></div>
          {fixed.map(c => (
            <div key={c.id} className="grid grid-cols-[1fr_140px_80px] items-center gap-2">
              <span className="text-sm font-medium">{c.name}</span>
              <Input inputMode="decimal" placeholder="$" value={rows[c.id]?.amount ?? ''} onChange={e => setRows(r => ({ ...r, [c.id]: { ...r[c.id], amount: e.target.value } }))} />
              <Input inputMode="numeric" value={rows[c.id]?.day ?? '10'} onChange={e => setRows(r => ({ ...r, [c.id]: { ...r[c.id], day: e.target.value } }))} aria-label={`Día de pago de ${c.name}`} />
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Después</Button>
          <Button disabled={filled.length === 0 || save.isPending} onClick={() => save.mutate()}>Guardar {filled.length > 0 ? `(${filled.length})` : ''}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lista de gastos fijos agendados: cambiar monto o día, o dejar de usarlos. */
function RecurringDialog({ open, onOpenChange, categories, onSetup }: {
  open: boolean; onOpenChange: (o: boolean) => void; categories: ExpenseCategory[]; onSetup: () => void;
}) {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ amount: '', day: '' });

  const { data: list = [] } = useQuery({
    queryKey: [...COSTS_KEY, 'recurring', establishmentId],
    enabled: open && !!establishmentId,
    queryFn: async () => {
      const { data, error } = await db.from('recurring_expenses').select('id, name, amount, day_of_month, category_id')
        .eq('establishment_id', establishmentId!).eq('is_active', true).order('day_of_month');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; amount: number; day_of_month: number; category_id: string }[];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await db.from('recurring_expenses').update(values as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: COSTS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gastos fijos que se repiten</DialogTitle>
          <DialogDescription>Cada mes, cuando llega el día, el sistema pregunta si ya se pagaron.</DialogDescription>
        </DialogHeader>
        {list.length === 0 ? (
          <div className="space-y-3 py-2 text-sm">
            <p className="text-muted-foreground">Todavía no hay gastos fijos agendados.</p>
            <Button onClick={onSetup}>Configurarlos ahora</Button>
          </div>
        ) : (
          <div className="divide-y">
            {list.map(r => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{categories.find(c => c.id === r.category_id)?.name} · día {r.day_of_month}</p>
                </div>
                {editing === r.id ? (
                  <>
                    <Input className="h-8 w-28" inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} aria-label="Monto" />
                    <Input className="h-8 w-14" inputMode="numeric" value={form.day} onChange={e => setForm(f => ({ ...f, day: e.target.value }))} aria-label="Día" />
                    <Button size="sm" onClick={() => update.mutate({ id: r.id, values: { amount: parseAmount(form.amount) || 0, day_of_month: Math.min(28, Math.max(1, Number(form.day) || 1)) } })}>Guardar</Button>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">{money(r.amount)}</span>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Editar" onClick={() => { setEditing(r.id); setForm({ amount: String(r.amount), day: String(r.day_of_month) }); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm(`¿Dejar de recordar ${r.name}?`)) update.mutate({ id: r.id, values: { is_active: false } }); }}>Quitar</Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Wallet className="h-3.5 w-3.5" />Para agregar otro, usá "Cargar gasto" y marcá "Se repite todos los meses".</p>
      </DialogContent>
    </Dialog>
  );
}
