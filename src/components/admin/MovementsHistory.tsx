import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useShowMore, ShowMoreButton } from '@/components/ui/show-more';

// Historial del dueño: todos los movimientos de caja del mes y, aparte, los que se borraron.

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const money = (n: number) => `$${Math.round(Number(n || 0)).toLocaleString('es-AR')}`;
const thisPeriod = () => new Date().toISOString().slice(0, 7);
const shift = (p: string, d: number) => {
  const dt = new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1 + d, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};
const when = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');

/** Nombres de usuarios (para mostrar quién cargó o borró). */
async function names(ids: (string | null)[]) {
  const uniq = [...new Set(ids.filter(Boolean))] as string[];
  if (!uniq.length) return {} as Record<string, string>;
  const { data } = await db.from('profiles').select('id, full_name, email').in('id', uniq);
  return Object.fromEntries((data ?? []).map((p: any) => [p.id, p.full_name || p.email || '—'])) as Record<string, string>;
}

function MonthPicker({ period, setPeriod }: { period: string; setPeriod: (p: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPeriod(shift(period, -1))} aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></Button>
      <span className="min-w-[140px] text-center text-sm font-semibold capitalize">{MONTHS[Number(period.slice(5, 7)) - 1]} {period.slice(0, 4)}</span>
      <Button variant="outline" size="icon" className="h-8 w-8" disabled={period >= thisPeriod()} onClick={() => setPeriod(shift(period, 1))} aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></Button>
    </div>
  );
}

/** Todos los ingresos y egresos del mes, con quién los cargó. */
export function AllMovements() {
  const { establishmentId } = useAuth();
  const [period, setPeriod] = useState(thisPeriod());
  const [search, setSearch] = useState('');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['history-movements', establishmentId, period],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { data, error } = await db.from('finance_transactions')
        .select('id, type, amount, date, description, affects_cash, created_by, created_at, finance_categories(name)')
        .eq('establishment_id', establishmentId!).gte('date', `${period}-01`).lt('date', `${shift(period, 1)}-01`)
        .order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;
      const users = await names((data ?? []).map((r: any) => r.created_by));
      return (data ?? []).map((r: any) => ({ ...r, user: r.created_by ? users[r.created_by] ?? '—' : '—' }));
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r: any) => [r.finance_categories?.name, r.description, r.user].some((s: string) => s?.toLowerCase().includes(q))) : rows;
  }, [rows, search]);
  const totals = useMemo(() => ({
    income: filtered.filter((r: any) => r.type === 'income').reduce((s: number, r: any) => s + Number(r.amount), 0),
    expense: filtered.filter((r: any) => r.type === 'expense').reduce((s: number, r: any) => s + Number(r.amount), 0),
  }), [filtered]);
  const list = useShowMore<any>(filtered, 25);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Todos los movimientos</CardTitle>
          <MonthPicker period={period} setPeriod={setPeriod} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input className="max-w-xs" placeholder="Buscar por categoría, detalle o usuario" value={search} onChange={e => setSearch(e.target.value)} />
          <span className="text-sm text-muted-foreground">Ingresos <strong className="text-foreground">{money(totals.income)}</strong> · Egresos <strong className="text-foreground">{money(totals.expense)}</strong></span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cargado</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoría y detalle</TableHead>
                  <TableHead>Plata</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.visible.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">{when(r.created_at)}</TableCell>
                    <TableCell><Badge variant={r.type === 'income' ? 'secondary' : 'outline'}>{r.type === 'income' ? 'Ingreso' : 'Egreso'}</Badge></TableCell>
                    <TableCell className="min-w-[180px]">
                      <div className="text-sm font-medium">{r.finance_categories?.name ?? '—'}</div>
                      {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{r.affects_cash ? 'Caja del turno' : 'Otra plata'}</TableCell>
                    <TableCell className="text-sm">{r.user}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold">{r.type === 'expense' ? '-' : ''}{money(r.amount)}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No hay movimientos en este mes.</TableCell></TableRow>}
              </TableBody>
            </Table>
            <ShowMoreButton hiddenCount={list.hiddenCount} expanded={list.expanded} onToggle={() => list.setExpanded(!list.expanded)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Movimientos borrados: cuándo se borró, quién, y los datos originales. */
export function DeletedMovements() {
  const { establishmentId } = useAuth();
  const [period, setPeriod] = useState(thisPeriod());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['history-deleted', establishmentId, period],
    enabled: !!establishmentId,
    queryFn: async () => {
      const from = new Date(`${period}-01T00:00:00-03:00`).toISOString();
      const to = new Date(`${shift(period, 1)}-01T00:00:00-03:00`).toISOString();
      const { data, error } = await db.from('deleted_finance_transactions')
        .select('id, type, amount, date, description, category_name, affects_cash, created_by, created_at, deleted_by, deleted_at')
        .eq('establishment_id', establishmentId!).gte('deleted_at', from).lt('deleted_at', to)
        .order('deleted_at', { ascending: false }).limit(1000);
      if (error) throw error;
      const users = await names((data ?? []).flatMap((r: any) => [r.created_by, r.deleted_by]));
      return (data ?? []).map((r: any) => ({ ...r, by: r.deleted_by ? users[r.deleted_by] ?? '—' : 'Automático', author: r.created_by ? users[r.created_by] ?? '—' : '—' }));
    },
  });
  const total = rows.reduce((s: number, r: any) => s + Number(r.amount), 0);
  const list = useShowMore<any>(rows, 25);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Movimientos borrados</CardTitle>
          <MonthPicker period={period} setPeriod={setPeriod} />
        </div>
        <p className="text-sm text-muted-foreground">
          Cada vez que alguien borra un ingreso o egreso queda registrado acá. {rows.length > 0 && <>Este mes: <strong className="text-foreground">{rows.length}</strong> por <strong className="text-foreground">{money(total)}</strong>.</>}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrado el</TableHead>
                  <TableHead>Lo borró</TableHead>
                  <TableHead>Qué era</TableHead>
                  <TableHead>Fecha original</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.visible.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs font-medium">{when(r.deleted_at)}</TableCell>
                    <TableCell className="text-sm">{r.by}</TableCell>
                    <TableCell className="min-w-[200px]">
                      <div className="text-sm font-medium">
                        <Badge variant="outline" className="mr-1.5 text-[11px]">{r.type === 'income' ? 'Ingreso' : 'Egreso'}</Badge>{r.category_name ?? '—'}
                      </div>
                      {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                      <div className="text-xs text-muted-foreground">Lo había cargado {r.author} · {r.affects_cash ? 'caja del turno' : 'otra plata'}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{dmy(r.date)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold text-destructive">{money(r.amount)}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No se borraron movimientos en este mes.</TableCell></TableRow>}
              </TableBody>
            </Table>
            <ShowMoreButton hiddenCount={list.hiddenCount} expanded={list.expanded} onToggle={() => list.setExpanded(!list.expanded)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
