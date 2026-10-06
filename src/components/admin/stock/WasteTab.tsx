import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useShowMore, ShowMoreButton } from '@/components/ui/show-more';

const REASONS = ['Vencimiento', 'Se quemó', 'Se cayó / derramó', 'Mala calidad', 'Sobrante del día', 'Otro'];

export default function WasteTab() {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ingredient_id: '', quantity: 0, reason: '' });

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients', establishmentId],
    queryFn: async () => {
      const { data } = await supabase.from('ingredients').select('*').eq('establishment_id', establishmentId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const { data: recentWastes = [] } = useQuery({
    queryKey: ['stock_movements', 'waste', establishmentId],
    queryFn: async () => {
      const { data } = await supabase.from('stock_movements').select('*, ingredients(name, unit)')
        .eq('establishment_id', establishmentId!).eq('type', 'waste')
        .order('created_at', { ascending: false }).limit(20);
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const wastesList = useShowMore<any>(recentWastes, 8);

  const wasteMutation = useMutation({
    mutationFn: async () => {
      const ing = ingredients.find((i: any) => i.id === form.ingredient_id) as any;
      if (!ing) throw new Error('Ingrediente no encontrado');

      // Deduct stock
      await supabase.from('ingredients').update({
        current_stock: Math.max(0, Number(ing.current_stock) - form.quantity),
      }).eq('id', form.ingredient_id);

      // Log movement
      await supabase.from('stock_movements').insert({
        establishment_id: establishmentId!, ingredient_id: form.ingredient_id,
        type: 'waste' as any, quantity: -form.quantity, reason: form.reason,
        created_by: session?.user?.id ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      toast({ title: 'Merma registrada' });
      setForm({ ingredient_id: '', quantity: 0, reason: '' });
    },
    onError: () => toast({ title: 'Error al registrar merma', variant: 'destructive' }),
  });

  const selectedIng = ingredients.find((i: any) => i.id === form.ingredient_id) as any;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Registrá desperdicios, vencimientos y pérdidas para descontar del inventario</p>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Ingrediente</Label>
              <Select value={form.ingredient_id} onValueChange={v => setForm(f => ({ ...f, ingredient_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>{ingredients.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.name} ({i.current_stock} {i.unit})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cantidad {selectedIng ? `(${selectedIng.unit})` : ''}</Label>
              <Input type="number" value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Motivo</Label>
              <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar motivo" /></SelectTrigger>
                <SelectContent>{REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={() => wasteMutation.mutate()}
            disabled={!form.ingredient_id || !form.quantity || !form.reason || wasteMutation.isPending}
            variant="destructive">
            <Trash2 className="h-4 w-4 mr-1" />
            {wasteMutation.isPending ? 'Registrando...' : 'Registrar merma'}
          </Button>
        </CardContent>
      </Card>

      {recentWastes.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <h3 className="font-medium mb-3">Mermas recientes</h3>
            {wastesList.visible.map((w: any) => (
              <div key={w.id} className="flex items-center justify-between p-2 rounded border">
                <div>
                  <span className="font-medium">{(w as any).ingredients?.name}</span>
                  <span className="text-muted-foreground ml-2">{Math.abs(w.quantity)} {(w as any).ingredients?.unit}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{w.reason}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleDateString('es-AR')}</span>
                </div>
              </div>
            ))}
            <ShowMoreButton hiddenCount={wastesList.hiddenCount} expanded={wastesList.expanded} onToggle={() => wastesList.setExpanded(!wastesList.expanded)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
