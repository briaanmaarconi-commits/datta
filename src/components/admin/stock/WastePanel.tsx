import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useShowMore, ShowMoreButton } from '@/components/ui/show-more';

// Mermas: lo que se pierde dentro del restaurante. Descuenta el stock y muestra cuánta plata se perdió.
export const WASTE_REASONS = [
  { id: 'expired', label: 'Vencido' },
  { id: 'burned', label: 'Se quemó o se cayó' },
  { id: 'broken', label: 'Rotura' },
  { id: 'staff', label: 'Consumo del personal' },
  { id: 'other', label: 'Otro' },
] as const;
type Reason = (typeof WASTE_REASONS)[number]['id'];

const money = (n: number) => `$${Math.round(Number(n || 0)).toLocaleString('es-AR')}`;
const UNIT: Record<string, string> = { g: 'g', kg: 'kg', ml: 'ml', l: 'l', u: 'unidades', unidad: 'unidades' };

interface Item { key: string; kind: 'ingredient' | 'product'; id: string; name: string; unit: string; stock: number }

/** Formulario de merma + historial. En modo simple solo hay productos; en avanzado, también ingredientes. */
export default function WastePanel({ advanced, onDone, compact = false }: { advanced: boolean; onDone?: () => void; compact?: boolean }) {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [itemKey, setItemKey] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<Reason | ''>('');
  const [note, setNote] = useState('');

  const { data: items = [] } = useQuery({
    queryKey: ['waste-items', establishmentId, advanced],
    enabled: !!establishmentId,
    queryFn: async () => {
      const out: Item[] = [];
      if (advanced) {
        const { data } = await db.from('ingredients').select('id, name, unit, current_stock')
          .eq('establishment_id', establishmentId!).eq('is_active', true).order('name');
        for (const i of data ?? []) out.push({ key: `i:${i.id}`, kind: 'ingredient', id: i.id, name: i.name, unit: i.unit, stock: Number(i.current_stock) });
      }
      const { data: prods } = await db.from('products').select('id, name, direct_stock')
        .eq('establishment_id', establishmentId!).eq('stock_mode', 'direct').order('name');
      for (const p of prods ?? []) out.push({ key: `p:${p.id}`, kind: 'product', id: p.id, name: p.name, unit: 'u', stock: Number(p.direct_stock) });
      return out;
    },
  });

  const { data: recent = [] } = useQuery({
    queryKey: ['stock_movements', 'waste', establishmentId],
    enabled: !!establishmentId && !compact,
    queryFn: async () => {
      const { data } = await db.from('stock_movements')
        .select('id, quantity, reason, waste_reason, value, created_at, ingredients(name, unit), products(name)')
        .eq('establishment_id', establishmentId!).eq('type', 'waste')
        .order('created_at', { ascending: false }).limit(100);
      return (data ?? []) as any[];
    },
  });
  const list = useShowMore<any>(recent, 8);

  const monthLost = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return recent.filter(w => new Date(w.created_at) >= start).reduce((s, w) => s + Number(w.value || 0), 0);
  }, [recent]);

  const item = items.find(i => i.key === itemKey);
  const qty = Number(quantity.replace(',', '.'));

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc('register_waste' as any, {
        _kind: item!.kind, _item_id: item!.id, _quantity: qty, _reason: reason, _note: note.trim() || null,
      });
      if (error) throw error;
      return data as { value: number };
    },
    onSuccess: (r) => {
      toast.success(`Merma registrada${r?.value ? `: se perdieron ${money(r.value)}` : ''}`);
      setItemKey('');
      setQuantity('');
      setReason('');
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['waste-items'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['direct-stock-products'] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo registrar la merma'),
  });

  const form = (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{advanced ? 'Ingrediente o producto' : 'Producto'}</Label>
          <Select value={itemKey} onValueChange={setItemKey}>
            <SelectTrigger><SelectValue placeholder="Elegí qué se perdió" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {items.length === 0 && <div className="p-2 text-sm text-muted-foreground">No hay {advanced ? 'ingredientes ni productos' : 'productos'} con stock cargado.</div>}
              {items.map(i => (
                <SelectItem key={i.key} value={i.key}>
                  {i.name} <span className="text-muted-foreground">({i.stock} {UNIT[i.unit] ?? i.unit}{advanced ? (i.kind === 'ingredient' ? ' · ingrediente' : ' · por unidad') : ''})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Cantidad perdida {item ? `(${UNIT[item.unit] ?? item.unit})` : ''}</Label>
          <Input inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder={item?.unit === 'g' ? 'Ej: 500' : 'Ej: 2'} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Motivo</Label>
        <div className="flex flex-wrap gap-2">
          {WASTE_REASONS.map(r => (
            <Button key={r.id} type="button" size="sm" variant={reason === r.id ? 'default' : 'outline'} onClick={() => setReason(r.id)}>{r.label}</Button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Aclaración (opcional)</Label>
        <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Ej: se cortó la luz y se perdió la heladera" />
      </div>
      <Button variant="destructive" className="gap-2" disabled={!item || !(qty > 0) || !reason || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Registrar merma
      </Button>
    </div>
  );

  if (compact) return form;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[1fr_260px]">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Registrar una merma</CardTitle></CardHeader>
          <CardContent>{form}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Perdido en mermas este mes</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{money(monthLost)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Se calcula con el costo cargado de cada ingrediente o producto.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Últimas mermas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {recent.length === 0 && <p className="text-sm text-muted-foreground">Todavía no registraste mermas.</p>}
          {list.visible.map(w => {
            const name = w.ingredients?.name ?? w.products?.name ?? '—';
            const unit = w.ingredients?.unit ? (UNIT[w.ingredients.unit] ?? w.ingredients.unit) : 'u';
            return (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{name}</span>
                  <span className="ml-2 text-muted-foreground">{Math.abs(Number(w.quantity))} {unit}</span>
                  {w.reason && <span className="ml-2 text-xs text-muted-foreground">· {w.reason}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {w.value != null && <Badge variant="outline" className={cn(Number(w.value) > 0 && 'border-destructive/40 text-destructive')}>-{money(w.value)}</Badge>}
                  <span className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleDateString('es-AR')}</span>
                </div>
              </div>
            );
          })}
          <ShowMoreButton hiddenCount={list.hiddenCount} expanded={list.expanded} onToggle={() => list.setExpanded(!list.expanded)} />
        </CardContent>
      </Card>
    </div>
  );
}
