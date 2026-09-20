import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, CreditCard, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';

export default function SuperAdminPlans() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', price: '', description: '', features: '' });

  const { data: plans = [] } = useQuery({
    queryKey: ['sa-all-plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_plans').select('*').order('price');
      if (error) throw error;
      return data;
    },
  });

  // Count clients per plan
  const { data: clientCounts = {} } = useQuery({
    queryKey: ['sa-plan-client-counts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('establishments').select('plan_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((e: any) => {
        if (e.plan_id) counts[e.plan_id] = (counts[e.plan_id] || 0) + 1;
      });
      return counts;
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        price: Number(form.price),
        description: form.description || null,
        features: form.features ? form.features.split('\n').filter(Boolean) : [],
      };
      if (editId) {
        const { error } = await supabase.from('client_plans').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('client_plans').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sa-all-plans'] });
      toast.success(editId ? 'Plan actualizado' : 'Plan creado');
      resetForm();
    },
    onError: () => toast.error('Error al guardar'),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('client_plans').update({ is_active: !is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sa-all-plans'] });
      toast.success('Estado actualizado');
    },
  });

  const resetForm = () => {
    setOpen(false);
    setEditId(null);
    setForm({ name: '', price: '', description: '', features: '' });
  };

  const startEdit = (p: any) => {
    setEditId(p.id);
    setForm({ name: p.name, price: p.price.toString(), description: p.description || '', features: (p.features || []).join('\n') });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Planes</h1>
        <Dialog open={open} onOpenChange={v => { if (!v) resetForm(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo plan</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Nuevo'} plan</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); upsert.mutate(); }} className="space-y-4">
              <div className="space-y-2"><Label>Nombre</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Ej: Básico, Avanzado, Premium" /></div>
              <div className="space-y-2"><Label>Precio mensual ($)</Label><Input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Descripción</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="space-y-2"><Label>Características (una por línea)</Label><Textarea value={form.features} onChange={e => setForm({ ...form, features: e.target.value })} rows={4} placeholder="Menú digital&#10;Hasta 20 mesas&#10;Soporte prioritario" /></div>
              <Button type="submit" className="w-full" disabled={upsert.isPending}>{upsert.isPending ? 'Guardando...' : 'Guardar'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan: any) => (
          <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" />{plan.name}</span>
                <Badge variant={plan.is_active ? 'default' : 'secondary'}>{plan.is_active ? 'Activo' : 'Inactivo'}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-bold">${Number(plan.price).toLocaleString('es-AR')}<span className="text-sm text-muted-foreground font-normal">/mes</span></div>
              {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
              {plan.features?.length > 0 && (
                <ul className="text-sm space-y-1">
                  {plan.features.map((f: string, i: number) => <li key={i} className="flex items-center gap-2">✓ {f}</li>)}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">{(clientCounts as any)[plan.id] || 0} clientes con este plan</p>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => startEdit(plan)}><Pencil className="h-3 w-3 mr-1" /> Editar</Button>
                <Button variant="outline" size="sm" onClick={() => toggleActive.mutate({ id: plan.id, is_active: plan.is_active })}>
                  {plan.is_active ? <ToggleRight className="h-3 w-3 mr-1" /> : <ToggleLeft className="h-3 w-3 mr-1" />}
                  {plan.is_active ? 'Desactivar' : 'Activar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {plans.length === 0 && (
          <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">No hay planes creados. Creá el primero.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
