import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Building2, Plus, Pencil, Eye, Search, DollarSign, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';

const SERVICE_LABELS: Record<string, string> = { active: 'Activo', suspended: 'Suspendido', cancelled: 'Cancelado' };
const SERVICE_BADGE: Record<string, 'default' | 'secondary' | 'destructive'> = { active: 'default', suspended: 'secondary', cancelled: 'destructive' };
const PAYMENT_METHODS: Record<string, string> = { transfer: 'Transferencia', cash: 'Efectivo', card: 'Tarjeta', check: 'Cheque', other: 'Otro' };
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function SuperAdminClients() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentEstId, setPaymentEstId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', address: '', city: '', contact_phone: '', contact_email: '', plan_id: '', agreed_price: '', service_start_date: '', service_status: 'active', delivery_enabled: false, rappi_commission: '', peya_commission: '' });
  const [payForm, setPayForm] = useState({ amount: '', payment_method: 'transfer', period_month: (new Date().getMonth() + 1).toString(), period_year: new Date().getFullYear().toString(), payment_date: new Date().toISOString().split('T')[0], notes: '' });

  const { data: establishments = [] } = useQuery({
    queryKey: ['sa-clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('establishments').select('*, client_plans(name, price)').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['sa-plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_plans').select('*').eq('is_active', true).order('price');
      if (error) throw error;
      return data;
    },
  });

  const { data: allPayments = [] } = useQuery({
    queryKey: ['sa-client-payments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_payments').select('*, establishments(name)').order('period_year, period_month', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        address: form.address || null,
        city: form.city || null,
        contact_phone: form.contact_phone || null,
        contact_email: form.contact_email || null,
        plan_id: form.plan_id || null,
        agreed_price: form.agreed_price ? Number(form.agreed_price) : 0,
        service_start_date: form.service_start_date || null,
        service_status: form.service_status,
        delivery_enabled: form.delivery_enabled,
        rappi_commission: form.rappi_commission ? Number(form.rappi_commission) : 0,
        peya_commission: form.peya_commission ? Number(form.peya_commission) : 0,
      };
      if (editId) {
        const { error } = await supabase.from('establishments').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('establishments').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sa-clients'] });
      toast.success(editId ? 'Cliente actualizado' : 'Cliente creado');
      resetForm();
    },
    onError: () => toast.error('Error al guardar'),
  });

  const createPayment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('client_payments').insert({
        establishment_id: paymentEstId!,
        amount: Number(payForm.amount),
        payment_method: payForm.payment_method,
        period_month: Number(payForm.period_month),
        period_year: Number(payForm.period_year),
        payment_date: payForm.payment_date,
        notes: payForm.notes || null,
        created_by: user?.id || null,
      });
      if (error) {
        if (error.code === '23505') throw new Error('Ya existe un pago registrado para ese período');
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sa-client-payments'] });
      toast.success('Pago registrado');
      setPaymentOpen(false);
      setPayForm({ amount: '', payment_method: 'transfer', period_month: (new Date().getMonth() + 1).toString(), period_year: new Date().getFullYear().toString(), payment_date: new Date().toISOString().split('T')[0], notes: '' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetForm = () => {
    setOpen(false);
    setEditId(null);
    setForm({ name: '', address: '', city: '', contact_phone: '', contact_email: '', plan_id: '', agreed_price: '', service_start_date: '', service_status: 'active', delivery_enabled: false, rappi_commission: '', peya_commission: '' });
  };

  const startEdit = (est: any) => {
    setEditId(est.id);
    setForm({
      name: est.name, address: est.address || '', city: est.city || '',
      contact_phone: est.contact_phone || '', contact_email: est.contact_email || '',
      plan_id: est.plan_id || '', agreed_price: est.agreed_price?.toString() || '',
      service_start_date: est.service_start_date || '', service_status: est.service_status || 'active',
      delivery_enabled: !!est.delivery_enabled,
      rappi_commission: est.rappi_commission?.toString() || '',
      peya_commission: est.peya_commission?.toString() || '',
    });
    setOpen(true);
  };

  const openPaymentDialog = (estId: string) => {
    const est = establishments.find((e: any) => e.id === estId);
    setPaymentEstId(estId);
    setPayForm({
      amount: est?.agreed_price?.toString() || '',
      payment_method: 'transfer',
      period_month: (new Date().getMonth() + 1).toString(),
      period_year: new Date().getFullYear().toString(),
      payment_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setPaymentOpen(true);
  };

  const filtered = establishments.filter((e: any) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.city || '').toLowerCase().includes(search.toLowerCase())
  );

  const detail = detailId ? establishments.find((e: any) => e.id === detailId) : null;
  const detailPayments = detailId ? allPayments.filter((p: any) => p.establishment_id === detailId) : [];

  const getMonthsActive = (startDate: string | null) => {
    if (!startDate) return '—';
    const start = new Date(startDate);
    const now = new Date();
    const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    return months <= 0 ? '< 1 mes' : `${months} meses`;
  };

  // Check if current month is paid
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const isCurrentMonthPaid = (estId: string) =>
    allPayments.some((p: any) => p.establishment_id === estId && p.period_month === currentMonth && p.period_year === currentYear);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-56" />
          </div>
          <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); else setOpen(true); }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo cliente</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Nuevo'} cliente</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); upsert.mutate(); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2"><Label>Nombre del restaurante</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Ciudad</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Dirección</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Teléfono</Label><Input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
                  <div className="space-y-2">
                    <Label>Plan</Label>
                    <Select value={form.plan_id} onValueChange={v => {
                      const plan = plans.find((p: any) => p.id === v);
                      setForm({ ...form, plan_id: v, agreed_price: plan?.price?.toString() || form.agreed_price });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>
                        {plans.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} - ${p.price}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Precio acordado</Label><Input type="number" value={form.agreed_price} onChange={e => setForm({ ...form, agreed_price: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Inicio del servicio</Label><Input type="date" value={form.service_start_date} onChange={e => setForm({ ...form, service_start_date: e.target.value })} /></div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Select value={form.service_status} onValueChange={v => setForm({ ...form, service_status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Activo</SelectItem>
                        <SelectItem value="suspended">Suspendido</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label htmlFor="delivery-enabled" className="text-sm font-semibold cursor-pointer">Módulo Delivery (Rappi / PedidosYa)</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Habilita la sección Delivery en Caja y las analíticas por canal.</p>
                    </div>
                    <Switch id="delivery-enabled" checked={form.delivery_enabled} onCheckedChange={v => setForm({ ...form, delivery_enabled: v })} />
                  </div>
                  {form.delivery_enabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2"><Label>Comisión Rappi (%)</Label><Input type="number" step="0.1" value={form.rappi_commission} onChange={e => setForm({ ...form, rappi_commission: e.target.value })} placeholder="Ej: 25" /></div>
                      <div className="space-y-2"><Label>Comisión PedidosYa (%)</Label><Input type="number" step="0.1" value={form.peya_commission} onChange={e => setForm({ ...form, peya_commission: e.target.value })} placeholder="Ej: 22" /></div>
                    </div>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={upsert.isPending}>{upsert.isPending ? 'Guardando...' : 'Guardar'}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Payment registration dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Registrar pago</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createPayment.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mes</Label>
                <Select value={payForm.period_month} onValueChange={v => setPayForm({ ...payForm, period_month: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Año</Label>
                <Select value={payForm.period_year} onValueChange={v => setPayForm({ ...payForm, period_year: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[currentYear - 1, currentYear, currentYear + 1].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Monto ($)</Label><Input type="number" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} required /></div>
            <div className="space-y-2">
              <Label>Método de pago</Label>
              <Select value={payForm.payment_method} onValueChange={v => setPayForm({ ...payForm, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Fecha de pago</Label><Input type="date" value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} /></div>
            <div className="space-y-2"><Label>Notas (opcional)</Label><Input value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={createPayment.isPending}>{createPayment.isPending ? 'Registrando...' : 'Registrar pago'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail dialog with payment history */}
      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />{(detail as any)?.name}</DialogTitle></DialogHeader>
          {detail && (
            <Tabs defaultValue="info">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="info">Información</TabsTrigger>
                <TabsTrigger value="payments">Pagos</TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Ciudad:</span> <span className="font-medium">{(detail as any).city || '—'}</span></div>
                  <div><span className="text-muted-foreground">Dirección:</span> <span className="font-medium">{(detail as any).address || '—'}</span></div>
                  <div><span className="text-muted-foreground">Teléfono:</span> <span className="font-medium">{(detail as any).contact_phone || '—'}</span></div>
                  <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{(detail as any).contact_email || '—'}</span></div>
                  <div><span className="text-muted-foreground">Plan:</span> <span className="font-medium">{(detail as any).client_plans?.name || 'Sin plan'}</span></div>
                  <div><span className="text-muted-foreground">Precio:</span> <span className="font-medium">${Number((detail as any).agreed_price || 0).toLocaleString('es-AR')}</span></div>
                  <div><span className="text-muted-foreground">Inicio:</span> <span className="font-medium">{(detail as any).service_start_date ? new Date((detail as any).service_start_date).toLocaleDateString('es-AR') : '—'}</span></div>
                  <div><span className="text-muted-foreground">Antigüedad:</span> <span className="font-medium">{getMonthsActive((detail as any).service_start_date)}</span></div>
                  <div><span className="text-muted-foreground">Estado:</span> <Badge variant={SERVICE_BADGE[(detail as any).service_status] || 'secondary'}>{SERVICE_LABELS[(detail as any).service_status] || (detail as any).service_status}</Badge></div>
                  <div><span className="text-muted-foreground">Mes actual:</span> {isCurrentMonthPaid(detailId!) ? <Badge variant="default" className="bg-green-600">Pagado</Badge> : <Badge variant="destructive">Pendiente</Badge>}</div>
                </div>
              </TabsContent>
              <TabsContent value="payments">
                <div className="flex justify-end mb-3">
                  <Button size="sm" onClick={() => openPaymentDialog(detailId!)} className="gap-1"><Plus className="h-3 w-3" /> Registrar pago</Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Período</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailPayments.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell>{MONTH_NAMES[p.period_month - 1]} {p.period_year}</TableCell>
                        <TableCell className="font-medium">${Number(p.amount).toLocaleString('es-AR')}</TableCell>
                        <TableCell>{PAYMENT_METHODS[p.payment_method] || p.payment_method}</TableCell>
                        <TableCell>{new Date(p.payment_date).toLocaleDateString('es-AR')}</TableCell>
                        <TableCell className="text-muted-foreground">{p.notes || '—'}</TableCell>
                      </TableRow>
                    ))}
                    {detailPayments.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sin pagos registrados</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restaurante</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Antigüedad</TableHead>
                <TableHead>Mes actual</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((est: any) => {
                const paid = isCurrentMonthPaid(est.id);
                return (
                  <TableRow key={est.id}>
                    <TableCell className="font-medium">{est.name}</TableCell>
                    <TableCell>{est.city || '—'}</TableCell>
                    <TableCell>{est.client_plans?.name || '—'}</TableCell>
                    <TableCell>${Number(est.agreed_price || 0).toLocaleString('es-AR')}</TableCell>
                    <TableCell>{getMonthsActive(est.service_start_date)}</TableCell>
                    <TableCell>
                      {est.service_status === 'active' ? (
                        paid ? (
                          <Badge variant="default" className="bg-green-600 gap-1"><CheckCircle2 className="h-3 w-3" />Pagado</Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Pendiente</Badge>
                        )
                      ) : '—'}
                    </TableCell>
                    <TableCell><Badge variant={SERVICE_BADGE[est.service_status] || 'secondary'}>{SERVICE_LABELS[est.service_status] || est.service_status}</Badge></TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => setDetailId(est.id)} title="Ver detalle"><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openPaymentDialog(est.id)} title="Registrar pago"><DollarSign className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => startEdit(est)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No se encontraron clientes</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
