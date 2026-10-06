import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, X, BookOpen } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function RecipesTab() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [newItem, setNewItem] = useState({ ingredient_id: '', quantity: 0 });

  const { data: products = [] } = useQuery({
    queryKey: ['products', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('products').select('*, categories(name)').eq('establishment_id', establishmentId!).order('name');
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('ingredients').select('*').eq('establishment_id', establishmentId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['product_recipes', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('product_recipes').select('*, ingredients(name, unit)');
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('product_recipes').insert({
        product_id: selectedProduct!, ingredient_id: newItem.ingredient_id, quantity: newItem.quantity,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_recipes'] });
      toast({ title: 'Ingrediente agregado a la receta' });
      setNewItem({ ingredient_id: '', quantity: 0 });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: e.message?.includes('duplicate') ? 'Ese ingrediente ya está en la receta' : 'Error al guardar', variant: 'destructive' }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('product_recipes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_recipes'] });
      toast({ title: 'Ingrediente removido de la receta' });
    },
  });

  const getRecipesForProduct = (productId: string) => recipes.filter((r: any) => r.product_id === productId);
  const productsWithRecipes = products.filter((p: any) => getRecipesForProduct(p.id).length > 0);
  const productsWithoutRecipes = products.filter((p: any) => getRecipesForProduct(p.id).length === 0);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Definí qué ingredientes y cantidades lleva cada producto del menú</p>

      {/* Products with recipes */}
      {productsWithRecipes.map((p: any) => {
        const pRecipes = getRecipesForProduct(p.id);
        return (
          <Card key={p.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{p.name} <span className="text-muted-foreground font-normal text-sm">({(p as any).categories?.name})</span></CardTitle>
                <Button size="sm" variant="outline" onClick={() => { setSelectedProduct(p.id); setOpen(true); }}>
                  <Plus className="h-3 w-3 mr-1" />Agregar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {pRecipes.map((r: any) => (
                  <Badge key={r.id} variant="secondary" className="gap-1 py-1 pl-3 pr-1">
                    {r.quantity} {(r as any).ingredients?.unit} de {(r as any).ingredients?.name}
                    <Button variant="ghost" size="icon" className="h-5 w-5 ml-1" onClick={() => removeMutation.mutate(r.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Products without recipes */}
      {productsWithoutRecipes.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4" />Productos sin receta</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {productsWithoutRecipes.map((p: any) => (
                <Button key={p.id} variant="outline" className="justify-start" onClick={() => { setSelectedProduct(p.id); setOpen(true); }}>
                  <Plus className="h-3 w-3 mr-2" />{p.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {ingredients.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Primero cargá ingredientes en la pestaña "Ingredientes"
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar ingrediente a: {products.find((p: any) => p.id === selectedProduct)?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Select value={newItem.ingredient_id} onValueChange={v => setNewItem(n => ({ ...n, ingredient_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar ingrediente" /></SelectTrigger>
                <SelectContent>
                  {ingredients.map((i: any) => (
                    <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Input type="number" step="0.1" placeholder={`Cantidad en ${ingredients.find((i: any) => i.id === newItem.ingredient_id)?.unit || 'unidades'}`}
                value={newItem.quantity || ''} onChange={e => setNewItem(n => ({ ...n, quantity: Number(e.target.value) }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!newItem.ingredient_id || !newItem.quantity || addMutation.isPending}>
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
