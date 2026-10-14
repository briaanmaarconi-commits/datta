import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { money } from '@/lib/costs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface Company {
  id: string;
  name: string;
  cuit: string | null;
  razon_social: string | null;
  contact: string | null;
  cutoff_day: number | null;
  is_active: boolean;
}
interface VoucherRow {
  account_id: string;
  amount: number;
  settlement_id: string | null;
}
interface Form {
  name: string;
  cuit: string;
  razon_social: string;
  contact: string;
  cutoff_day: string;
  is_active: boolean;
}
const EMPTY: Form = { name: '', cuit: '', razon_social: '', contact: '', cutoff_day: '', is_active: true };
const KEY = 'company-accounts';

/**
 * Cuentas corrientes de empresas (admin y caja). La caja da de alta empresas nuevas y ve los saldos;
 * editar o desactivar una empresa queda para el administrador.
 */
export default function CompanyAccounts() {
  const { establishmentId, role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === 'admin' || role === 'superadmin';
  const [editing, setEditing] = useState<Company | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: [KEY, establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('company_accounts').select('*').eq('establishment_id', establishmentId!).order('name');
      if (error) throw error;
      return (data ?? []) as Company[];
    },
    enabled: !!establishmentId,
  });

  const { data: vouchers = [] } = useQuery({
    queryKey: [KEY, 'vouchers', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('company_vouchers').select('account_id, amount, settlement_id').eq('establishment_id', establishmentId!);
      if (error) throw error;
      return (data ?? []) as VoucherRow[];
    },
    enabled: !!establishmentId,
  });

  const balances = useMemo(() => {
    const m = new Map<string, { pending: number; count: number }>();
    for (const v of vouchers) {
      if (v.settlement_id) continue;
      const cur = m.get(v.account_id) ?? { pending: 0, count: 0 };
      cur.pending += Number(v.amount);
      cur.count += 1;
      m.set(v.account_id, cur);
    }
    return m;
  }, [vouchers]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (c: Company) => {
    setEditing(c);
    setForm({
      name: c.name, cuit: c.cuit ?? '', razon_social: c.razon_social ?? '', contact: c.contact ?? '',
      cutoff_day: c.cutoff_day ? String(c.cutoff_day) : '', is_active: c.is_active,
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (!name) throw new Error('Poné el nombre de la empresa');
      const cuit = form.cuit.replace(/\D/g, '');
      if (cuit && cuit.length !== 11) throw new Error('El CUIT debe tener 11 dígitos');
      const cutoff = form.cutoff_day.trim() ? Number(form.cutoff_day) : null;
      if (cutoff !== null && !(Number.isInteger(cutoff) && cutoff >= 1 && cutoff <= 28)) {
        throw new Error('El día de corte va de 1 a 28 (vacío = fin de mes)');
      }
      const base = {
        name,
        cuit: cuit || null,
        razon_social: form.razon_social.trim() || null,
        contact: form.contact.trim() || null,
        cutoff_day: cutoff,
      };
      if (editing) {
        const { error } = await db.from('company_accounts')
          .update({ ...base, is_active: form.is_active, updated_at: new Date().toISOString() }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('company_accounts').insert({ ...base, establishment_id: establishmentId! });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success(editing ? 'Empresa actualizada' : 'Empresa agregada');
      setOpen(false);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : '';
      toast.error(/duplicate|unique|company_accounts_name_key/i.test(msg) ? 'Ya existe una empresa con ese nombre' : msg || 'No se pudo guardar');
    },
  });

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const totalPending = [...balances.values()].reduce((s, b) => s + b.pending, 0);

  return (
    <div className="max-w-4xl space-y-6 pb-28 lg:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cuentas corrientes</h1>
          <p className="mt-1 text-muted-foreground">
            Empresas que mandan a sus empleados con un vale y pagan a fin de mes.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nueva empresa</Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
          <span className="text-sm text-muted-foreground">Saldo pendiente de cobro (todas las empresas)</span>
          <span className="text-2xl font-bold">{money(totalPending)}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Building2 className="h-5 w-5" /> Empresas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>}
          {!isLoading && companies.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay empresas. Agregá la primera con “Nueva empresa”.</p>
          )}
          {companies.map((c) => {
            const b = balances.get(c.id);
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {c.name} {!c.is_active && <Badge variant="secondary" className="ml-1">Inactiva</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.cuit ? `CUIT ${c.cuit}` : 'Sin CUIT'} · Corte: {c.cutoff_day ? `día ${c.cutoff_day}` : 'fin de mes'}
                    {c.contact ? ` · ${c.contact}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-bold">{money(b?.pending ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">{b?.count ?? 0} vales sin cobrar</p>
                  </div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label={`Editar ${c.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Editar empresa' : 'Nueva empresa'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej. Transportes del Sur" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>CUIT</Label>
                <Input value={form.cuit} inputMode="numeric" onChange={(e) => set({ cuit: e.target.value })} placeholder="11 dígitos" />
              </div>
              <div className="space-y-1.5">
                <Label>Día de corte</Label>
                <Input value={form.cutoff_day} inputMode="numeric" onChange={(e) => set({ cutoff_day: e.target.value })} placeholder="1 a 28 (vacío = fin de mes)" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Razón social</Label>
              <Input value={form.razon_social} onChange={(e) => set({ razon_social: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Contacto</Label>
              <Input value={form.contact} onChange={(e) => set({ contact: e.target.value })} placeholder="Nombre, teléfono o mail" />
            </div>
            {editing && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="company-active">Empresa activa</Label>
                <Switch id="company-active" checked={form.is_active} onCheckedChange={(v) => set({ is_active: v })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
