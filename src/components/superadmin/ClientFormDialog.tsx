import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const EMPTY = { name: '', address: '', city: '', contact_phone: '', contact_email: '', plan_id: '', agreed_price: '', service_start_date: '', service_status: 'active', delivery_enabled: false, drinks_print_at_cashier: false, waiter_push_enabled: false, rappi_commission: '', peya_commission: '' };

const fromClient = (est: any) => ({
  name: est.name, address: est.address || '', city: est.city || '',
  contact_phone: est.contact_phone || '', contact_email: est.contact_email || '',
  plan_id: est.plan_id || '', agreed_price: est.agreed_price?.toString() || '',
  service_start_date: est.service_start_date || '', service_status: est.service_status || 'active',
  delivery_enabled: !!est.delivery_enabled,
  drinks_print_at_cashier: !!est.drinks_print_at_cashier,
  waiter_push_enabled: !!est.waiter_push_enabled,
  rappi_commission: est.rappi_commission?.toString() || '',
  peya_commission: est.peya_commission?.toString() || '',
});

/** Alta o edición de un cliente (restaurante). Con `client` edita; sin él, crea uno nuevo. */
export default function ClientFormDialog({ open, onOpenChange, client }: { open: boolean; onOpenChange: (v: boolean) => void; client?: any | null }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const editId = client?.id ?? null;

  useEffect(() => { if (open) setForm(client ? fromClient(client) : EMPTY); }, [open, client]);

  const { data: plans = [] } = useQuery({
    queryKey: ['sa-plans'],
    queryFn: async () => {
      const { data, error } = await db.from('client_plans').select('*').eq('is_active', true).order('price');
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
        drinks_print_at_cashier: form.drinks_print_at_cashier,
        waiter_push_enabled: form.waiter_push_enabled,
        rappi_commission: form.rappi_commission ? Number(form.rappi_commission) : 0,
        peya_commission: form.peya_commission ? Number(form.peya_commission) : 0,
      };
      if (editId) {
        const { error } = await db.from('establishments').update(payload as any).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await db.from('establishments').insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sa-clients'] });
      queryClient.invalidateQueries({ queryKey: ['sa-client', editId] });
      queryClient.invalidateQueries({ queryKey: ['billing-overview'] });
      toast.success(editId ? 'Cliente actualizado' : 'Cliente creado');
      onOpenChange(false);
    },
    onError: () => toast.error('Error al guardar'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                if (!v) return;
                const plan = plans.find((p: any) => p.id === v);
                setForm(f => ({ ...f, plan_id: v, agreed_price: plan?.price?.toString() || f.agreed_price }));
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
              {/* Radix manda '' al guardar si el valor no está en la lista: se ignora para no borrar el estado */}
              <Select value={form.service_status} onValueChange={v => v && setForm(f => ({ ...f, service_status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Prueba gratis</SelectItem>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="past_due">Vencido</SelectItem>
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

          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="drinks-cashier" className="text-sm font-semibold cursor-pointer">Bebidas por la comandera de caja</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Las comandas de bebidas salen en la caja y el resto en cocina. En la PC de caja hay que encender «Imprimir comandas automáticamente» (Impresoras).</p>
              </div>
              <Switch id="drinks-cashier" checked={form.drinks_print_at_cashier} onCheckedChange={v => setForm({ ...form, drinks_print_at_cashier: v })} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="waiter-push" className="text-sm font-semibold cursor-pointer">Avisos al celular del mozo</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Cuando cocina marca un pedido como listo, le llega una notificación solo al mozo que lo tomó.</p>
              </div>
              <Switch id="waiter-push" checked={form.waiter_push_enabled} onCheckedChange={v => setForm({ ...form, waiter_push_enabled: v })} />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={upsert.isPending}>{upsert.isPending ? 'Guardando...' : 'Guardar'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
