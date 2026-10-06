import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

const UNITS = [
  { value: 'g', label: 'Gramos (g)' },
  { value: 'kg', label: 'Kilogramos (kg)' },
  { value: 'ml', label: 'Mililitros (ml)' },
  { value: 'l', label: 'Litros (l)' },
  { value: 'unidad', label: 'Unidades' },
];

const emptyForm = { name: '', unit: 'g', current_stock: 0, min_stock: 0, cost_per_unit: 0, supplier: '' };

export default function IngredientsTab() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('ingredients')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await db.from('ingredients').update({
          name: form.name, unit: form.unit, current_stock: form.current_stock,
          min_stock: form.min_stock, cost_per_unit: form.cost_per_unit, supplier: form.supplier || null,
        }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('ingredients').insert({
          establishment_id: establishmentId!, name: form.name, unit: form.unit,
          current_stock: form.current_stock, min_stock: form.min_stock,
          cost_per_unit: form.cost_per_unit, supplier: form.supplier || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast({ title: editing ? 'Ingrediente actualizado' : 'Ingrediente creado' });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: () => toast({ title: 'Error al guardar', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('ingredients').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast({ title: 'Ingrediente eliminado' });
    },
  });

  const openEdit = (ing: any) => {
    setEditing(ing);
    setForm({ name: ing.name, unit: ing.unit, current_stock: ing.current_stock, min_stock: ing.min_stock, cost_per_unit: ing.cost_per_unit, supplier: ing.supplier || '' });
    setOpen(true);
  };

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };

  const stockStatus = (ing: any) => {
    if (ing.current_stock <= 0) return <Badge variant="destructive">Sin stock</Badge>;
    if (ing.current_stock <= ing.min_stock) return <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">Bajo</Badge>;
    return <Badge variant="secondary">OK</Badge>;
  };

  const filtered = ingredients.filter((i: any) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.supplier || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <p className="text-muted-foreground">Materia prima e insumos del establecimiento</p>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar ingrediente o proveedor..."
          className="pl-9"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Mínimo</TableHead>
              <TableHead className="text-right">Costo/u</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((ing: any) => (
              <TableRow key={ing.id}>
                <TableCell className="font-medium">{ing.name}</TableCell>
                <TableCell>{ing.unit}</TableCell>
                <TableCell className="text-right">{ing.current_stock}</TableCell>
                <TableCell className="text-right">{ing.min_stock}</TableCell>
                <TableCell className="text-right">${Number(ing.cost_per_unit).toFixed(2)}</TableCell>
                <TableCell>{ing.supplier || '-'}</TableCell>
                <TableCell>{stockStatus(ing)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(ing)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar "{ing.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>Se desactivará del inventario. Los movimientos históricos se conservan.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(ing.id)}>Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                {ingredients.length === 0 ? 'No hay ingredientes. Hacé click en "Agregar" para comenzar.' : 'No se encontraron ingredientes que coincidan con la búsqueda.'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Editar ingrediente' : 'Nuevo ingrediente'}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Nombre</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Carne picada" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Unidad de medida</Label>
                <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stock actual</Label>
                <Input type="number" value={form.current_stock} onChange={e => setForm(f => ({ ...f, current_stock: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Stock mínimo (alerta)</Label>
                <Input type="number" value={form.min_stock} onChange={e => setForm(f => ({ ...f, min_stock: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Costo por unidad ($)</Label>
                <Input type="number" step="0.01" value={form.cost_per_unit} onChange={e => setForm(f => ({ ...f, cost_per_unit: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <Label>Proveedor (opcional)</Label>
              <Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Ej: Distribuidora Norte" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
