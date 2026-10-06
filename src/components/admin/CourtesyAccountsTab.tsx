import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useCourtesyAccounts } from '@/hooks/useCourtesyAccounts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Gift, Plus, Pencil, Ban, Check } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

const TYPE_LABELS: Record<string, string> = {
  invitation: 'Invitación',
  staff_meal: 'Personal',
  internal: 'Interno',
};

function money(n: number) {
  return `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CourtesyAccountsTab({ readOnly = false }: { readOnly?: boolean }) {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useCourtesyAccounts(establishmentId, false);

  const today = new Date();
  const [from, setFrom] = useState(format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(today, 'yyyy-MM-dd'));

  const [editing, setEditing] = useState<{ id?: string; name: string } | null>(null);
  const [manual, setManual] = useState<{ accountId: string; amount: string; type: string; notes: string } | null>(null);

  const { data: charges = [] } = useQuery({
    queryKey: ['courtesy_charges', establishmentId, from, to],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { data, error } = await db
        .from('courtesy_charges')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .gte('created_at', `${from}T00:00:00`)
        .lte('created_at', `${to}T23:59:59`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const saveAccount = useMutation({
    mutationFn: async (payload: { id?: string; name: string }) => {
      if (!payload.name.trim()) throw new Error('El nombre es obligatorio');
      if (payload.id) {
        const { error } = await db.from('courtesy_accounts').update({ name: payload.name.trim() }).eq('id', payload.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('courtesy_accounts').insert({
          establishment_id: establishmentId!,
          name: payload.name.trim(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courtesy_accounts'] });
      setEditing(null);
      toast.success('Guardado');
    },
    onError: (e: any) => toast.error(e?.message || 'Error al guardar'),
  });

  const toggleActive = useMutation({
    mutationFn: async (a: { id: string; is_active: boolean }) => {
      const { error } = await db.from('courtesy_accounts').update({ is_active: !a.is_active }).eq('id', a.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['courtesy_accounts'] }),
    onError: (e: any) => toast.error(e?.message || 'Error'),
  });

  const addManualCharge = useMutation({
    mutationFn: async (m: { accountId: string; amount: string; type: string; notes: string }) => {
      const amount = Number(String(m.amount).replace(',', '.'));
      if (!amount || amount <= 0) throw new Error('Ingresá un monto válido');
      const { error } = await db.from('courtesy_charges').insert({
        establishment_id: establishmentId!,
        account_id: m.accountId === '__none__' ? null : m.accountId,
        table_number: null,
        order_ids: [],
        courtesy_type: m.type,
        sale_amount: amount,
        cost_amount: 0,
        notes: m.notes.trim() || 'Carga manual',
        created_by: session?.user?.id ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courtesy_charges'] });
      setManual(null);
      toast.success('Cortesía registrada');
    },
    onError: (e: any) => toast.error(e?.message || 'Error al registrar'),
  });


  const nameOf = (id: string | null) => accounts.find(a => a.id === id)?.name ?? 'Sin asignar';

  const totals = new Map<string, { sale: number; cost: number; count: number }>();
  for (const c of charges) {
    const key = c.account_id ?? 'none';
    const cur = totals.get(key) ?? { sale: 0, cost: 0, count: 0 };
    cur.sale += Number(c.sale_amount || 0);
    cur.cost += Number(c.cost_amount || 0);
    cur.count += 1;
    totals.set(key, cur);
  }
  const totalSale = charges.reduce((s, c) => s + Number(c.sale_amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Desde</Label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label className="text-xs">Hasta</Label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
        </div>
        {!readOnly && (
          <div className="ml-auto flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setEditing({ name: '' })}>
              <Plus className="h-4 w-4" /> Nueva persona
            </Button>
            <Button
              className="gap-2"
              onClick={() => setManual({ accountId: accounts[0]?.id ?? '__none__', amount: '', type: 'invitation', notes: '' })}
            >
              <Gift className="h-4 w-4" /> Cargar cortesía
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="h-4 w-4" /> Cuentas corrientes de cortesías
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead className="text-right">Cortesías</TableHead>
                <TableHead className="text-right">Consumido (venta)</TableHead>
                <TableHead className="text-right">Costo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map(a => {
                const t = totals.get(a.id) ?? { sale: 0, cost: 0, count: 0 };
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.name}{' '}
                      {!a.is_active && <Badge variant="secondary" className="ml-2">Inactiva</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{t.count}</TableCell>
                    <TableCell className="text-right font-semibold">{money(t.sale)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{money(t.cost)}</TableCell>
                    <TableCell className="text-right">
                      {readOnly ? (
                        <span className="text-xs text-muted-foreground">Solo lectura</span>
                      ) : (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => setEditing({ id: a.id, name: a.name })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => toggleActive.mutate({ id: a.id, is_active: a.is_active })}>
                            {a.is_active ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {totals.has('none') && (
                <TableRow>
                  <TableCell className="italic text-muted-foreground">Sin asignar</TableCell>
                  <TableCell className="text-right">{totals.get('none')!.count}</TableCell>
                  <TableCell className="text-right font-semibold">{money(totals.get('none')!.sale)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{money(totals.get('none')!.cost)}</TableCell>
                  <TableCell />
                </TableRow>
              )}
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    No hay personas cargadas
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Detalle de cortesías del período — total {money(totalSale)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead>Mesa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {charges.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(c.created_at), 'dd/MM HH:mm', { locale: es })}
                  </TableCell>
                  <TableCell>{nameOf(c.account_id)}</TableCell>
                  <TableCell>{c.table_number ?? '-'}</TableCell>
                  <TableCell>{TYPE_LABELS[c.courtesy_type] ?? c.courtesy_type}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-muted-foreground">{c.notes || '-'}</TableCell>
                  <TableCell className="text-right font-medium">{money(c.sale_amount)}</TableCell>
                </TableRow>
              ))}
              {charges.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Sin cortesías en el período
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar persona' : 'Nueva persona'}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Nombre</Label>
            <Input
              value={editing?.name ?? ''}
              onChange={e => setEditing(prev => ({ ...(prev ?? { name: '' }), name: e.target.value }))}
              placeholder="Ej: Maria Luz"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => editing && saveAccount.mutate(editing)} disabled={saveAccount.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!manual} onOpenChange={v => !v && setManual(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cargar cortesía manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Persona</Label>
              <Select value={manual?.accountId} onValueChange={v => setManual(p => p && { ...p, accountId: v })}>
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent className="z-[100] bg-popover">
                  <SelectItem value="__none__">Sin asignar</SelectItem>
                  {accounts.filter(a => a.is_active).map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={manual?.type} onValueChange={v => setManual(p => p && { ...p, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[100] bg-popover">
                  <SelectItem value="invitation">Invitación</SelectItem>
                  <SelectItem value="staff_meal">Personal</SelectItem>
                  <SelectItem value="internal">Interno</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Monto</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={manual?.amount ?? ''}
                onChange={e => setManual(p => p && { ...p, amount: e.target.value })}
                placeholder="34000"
              />
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Input
                value={manual?.notes ?? ''}
                onChange={e => setManual(p => p && { ...p, notes: e.target.value })}
                placeholder="Ej: cena del sábado"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManual(null)}>Cancelar</Button>
            <Button onClick={() => manual && addManualCharge.mutate(manual)} disabled={addManualCharge.isPending}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
