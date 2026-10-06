import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Search, Plus, Minus, ShoppingCart, X, UtensilsCrossed } from 'lucide-react';
import ComboPickerDialog from '@/components/menu/ComboPickerDialog';
import { useActiveCombos, ComboExpandedLine } from '@/hooks/useMenuCombos';

export interface CartLine {
  /** Clave única de la línea (los productos de un combo llevan clave propia). */
  line_id?: string;
  product_id: string;
  name: string;
  price: number;
  quantity: number;
}

const lineKey = (l: CartLine) => l.line_id ?? l.product_id;

interface AddProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  establishmentId?: string | null;
  tableNumber?: number;
  isSubmitting?: boolean;
  onConfirm: (cart: CartLine[], sendToKitchen: boolean) => void;
}

export default function AddProductsDialog({
  open,
  onOpenChange,
  establishmentId,
  tableNumber,
  isSubmitting,
  onConfirm,
}: AddProductsDialogProps) {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sendToKitchen, setSendToKitchen] = useState(true);
  const [comboOpen, setComboOpen] = useState(false);

  const { data: combos = [] } = useActiveCombos(establishmentId, open);

  const { data: categories = [] } = useQuery({
    queryKey: ['cashier-add-categories', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('categories')
        .select('id, name')
        .eq('establishment_id', establishmentId!)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId && open,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['cashier-add-products', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('products')
        .select('id, name, price, promo_price, promo_active, category_id, is_available')
        .eq('establishment_id', establishmentId!)
        .eq('is_available', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId && open,
  });

  const effectivePrice = (p: any) =>
    p.promo_active && p.promo_price != null ? Number(p.promo_price) : Number(p.price);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products as any[]).filter(p => {
      if (categoryId !== 'all' && p.category_id !== categoryId) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, categoryId]);

  const addProduct = (p: any) => {
    setCart(prev => {
      // Sólo agrupamos con líneas sueltas: las de combo (line_id) van con precio del combo
      const existing = prev.find(l => !l.line_id && l.product_id === p.id);
      if (existing) {
        return prev.map(l => (!l.line_id && l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product_id: p.id, name: p.name, price: effectivePrice(p), quantity: 1 }];
    });
  };

  const addCombo = (lines: ComboExpandedLine[], comboName: string) => {
    const stamp = Date.now();
    setCart(prev => [
      ...prev,
      ...lines.map((l, idx) => ({
        line_id: `combo-${stamp}-${idx}`,
        product_id: l.product_id,
        name: l.name,
        price: l.price,
        quantity: 1,
      })),
    ]);
    toast.success(`Combo "${comboName}" agregado`);
  };

  const changeQty = (key: string, delta: number) => {
    setCart(prev =>
      prev
        .map(l => (lineKey(l) === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter(l => l.quantity > 0),
    );
  };

  const cartTotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);

  const reset = () => {
    setCart([]);
    setSearch('');
    setCategoryId('all');
    setSendToKitchen(true);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Agregar productos{tableNumber ? ` — Mesa ${tableNumber}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar producto…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={categoryId === 'all' ? 'default' : 'outline'}
              onClick={() => setCategoryId('all')}
            >
              Todas
            </Button>
            {(categories as any[]).map(c => (
              <Button
                key={c.id}
                type="button"
                size="sm"
                variant={categoryId === c.id ? 'default' : 'outline'}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>

          {combos.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 border-amber-500/40 text-amber-600"
              onClick={() => setComboOpen(true)}
            >
              <UtensilsCrossed className="h-4 w-4" />
              Agregar combo del día
            </Button>
          )}

          <ScrollArea className="h-56 rounded-md border">
            <div className="divide-y">
              {filtered.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground text-center">Sin resultados</p>
              )}
              {filtered.map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
                  onClick={() => addProduct(p)}
                >
                  <span className="text-sm">{p.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">${effectivePrice(p).toFixed(2)}</span>
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>

          <div className="space-y-2 border-t pt-3">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              A agregar
              {cart.length > 0 && <Badge variant="secondary">{cart.length}</Badge>}
            </Label>
            {cart.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Elegí productos de la lista para sumarlos a la cuenta de la mesa.
              </p>
            ) : (
              <div className="space-y-1.5">
                {cart.map(l => (
                  <div key={lineKey(l)} className="flex items-center gap-2">
                    <span className="flex-1 text-sm truncate">{l.name}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => changeQty(lineKey(l), -1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-6 text-center text-sm">{l.quantity}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => changeQty(lineKey(l), 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-20 text-right text-sm font-medium">
                      ${(l.price * l.quantity).toFixed(2)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setCart(prev => prev.filter(x => lineKey(x) !== lineKey(l)))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-sm border-t pt-2">
                  <span>Subtotal</span>
                  <span>${cartTotal.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div>
              <Label htmlFor="send-kitchen" className="text-sm">Mandar comanda a cocina</Label>
              <p className="text-[11px] text-muted-foreground">
                Apagalo para bebidas o ítems que ya se sirvieron: van directo a la cuenta sin comanda.
              </p>
            </div>
            <Switch id="send-kitchen" checked={sendToKitchen} onCheckedChange={setSendToKitchen} />
          </div>

          <Button
            className="w-full"
            disabled={cart.length === 0 || isSubmitting}
            onClick={() => onConfirm(cart, sendToKitchen)}
          >
            {isSubmitting ? 'Agregando…' : `Agregar a la cuenta ($${cartTotal.toFixed(2)})`}
          </Button>
        </div>
      </DialogContent>

      <ComboPickerDialog
        combos={combos}
        open={comboOpen}
        onOpenChange={setComboOpen}
        onConfirm={addCombo}
      />
    </Dialog>
  );
}
