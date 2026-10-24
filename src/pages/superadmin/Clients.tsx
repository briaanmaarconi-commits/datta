import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { Plus, Pencil, Search, DollarSign, AlertTriangle, CheckCircle2, Trash2, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import ClientFormDialog from '@/components/superadmin/ClientFormDialog';
import DeleteClientDialog from '@/components/superadmin/DeleteClientDialog';
import DemoRestaurantButton from '@/components/superadmin/DemoRestaurantButton';
import { billing, fmtDate, STATUS_BADGE, STATUS_LABELS, type BillingOverview } from '@/lib/billingApi';

const PAYMENT_METHODS: Record<string, string> = { transfer: 'Transferencia', cash: 'Efectivo', card: 'Tarjeta', check: 'Cheque', other: 'Otro' };
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function SuperAdminClients() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentEstId, setPaymentEstId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', payment_method: 'transfer', period_month: (new Date().getMonth() + 1).toString(), period_year: new Date().getFullYear().toString(), payment_date: new Date().toISOString().split('T')[0], notes: '' });

  const { data: establishments = [] } = useQuery({
    queryKey: ['sa-clients'],
    queryFn: async () => {
      const { data, error } = await db.from('establishments').select('*, client_plans(name, price)').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: allPayments = [] } = useQuery({
    queryKey: ['sa-client-payments'],
    queryFn: async () => {
      const { data, error } = await db.from('client_payments').select('*, establishments(name)').order('period_year, period_month', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: billingOverview } = useQuery({ queryKey: ['billing-overview'], queryFn: () => billing<BillingOverview>('overview') });
  const subOf = (id: string) => billingOverview?.clients.find((c) => c.id === id) ?? null;

  const createPayment = useMutation({
    mutationFn: async () => {
      // El backend registra el pago, deja al cliente al día, corre el vencimiento y lo anota en Caja Datta.
      await billing('register-payment', {
        establishment_id: paymentEstId!,
        amount: Number(payForm.amount),
        payment_method: payForm.payment_method,
        period_month: Number(payForm.period_month),
        period_year: Number(payForm.period_year),
        payment_date: payForm.payment_date,
        notes: payForm.notes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sa-client-payments'] });
      queryClient.invalidateQueries({ queryKey: ['billing-overview'] });
      toast.success('Pago registrado');
      setPaymentOpen(false);
      setPayForm({ amount: '', payment_method: 'transfer', period_month: (new Date().getMonth() + 1).toString(), period_year: new Date().getFullYear().toString(), payment_date: new Date().toISOString().split('T')[0], notes: '' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openForm = (est: any | null) => { setEditing(est); setFormOpen(true); };

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

  // Botones de la fila: no deben abrir la ficha al hacer clic.
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-56" />
          </div>
          <DemoRestaurantButton exists={establishments.some((e: any) => e.name === 'DEMO Datta')} />
          <Button className="gap-2" onClick={() => openForm(null)}><Plus className="h-4 w-4" /> Nuevo cliente</Button>
        </div>
      </div>

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} client={editing} />
      <DeleteClientDialog client={deleteTarget} onClose={() => setDeleteTarget(null)} />

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

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restaurante</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Antigüedad</TableHead>
                <TableHead>Mes actual</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((est: any) => {
                const paid = isCurrentMonthPaid(est.id);
                const sub = subOf(est.id);
                const status = sub?.effective_status ?? est.service_status;
                return (
                  <TableRow key={est.id} className="cursor-pointer" onClick={() => navigate(`/superadmin/clients/${est.id}`)}>
                    <TableCell className="font-medium">{est.name}</TableCell>
                    <TableCell>{est.city || '—'}</TableCell>
                    <TableCell>{est.client_plans?.name || '—'}</TableCell>
                    <TableCell>${Number(est.agreed_price || 0).toLocaleString('es-AR')}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {status === 'trial' && sub?.trial_ends_at ? <span title="Fin de la prueba gratis">Prueba: {fmtDate(sub.trial_ends_at)}</span>
                        : sub?.billing_configured && sub.next_due_date ? fmtDate(sub.next_due_date) : '—'}
                    </TableCell>
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
                    <TableCell><Badge variant={STATUS_BADGE[status] || 'secondary'}>{STATUS_LABELS[status] || status}</Badge></TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={stop(() => openPaymentDialog(est.id))} title="Registrar pago"><DollarSign className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={stop(() => openForm(est))} title="Editar"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={stop(() => setDeleteTarget({ id: est.id, name: est.name }))} title="Eliminar cliente" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      <ChevronRight className="inline h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No se encontraron clientes</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
