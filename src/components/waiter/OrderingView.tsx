import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Search, Plus, Minus, ShoppingCart, Send, X, StickyNote, UtensilsCrossed } from 'lucide-react';
import ComboPickerDialog from '@/components/menu/ComboPickerDialog';
import { ComboExpandedLine } from '@/hooks/useMenuCombos';

interface CartItem {
  /** Clave única de la línea (los productos de un combo llevan clave propia). */
  line_id?: string;
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
}

const lineKey = (i: CartItem) => i.line_id ?? i.product_id;

interface OrderingViewProps {
  tableNumber: number;
  isAddingToExisting: boolean;
  categories: any[];
  products: any[];
  combos?: any[];
  onSubmit: (cart: CartItem[]) => void;
  onClose: () => void;
  isPending: boolean;
  initialCart?: CartItem[];
}

export default function OrderingView({
  tableNumber,
  isAddingToExisting,
  categories,
  products,
  combos = [],
  onSubmit,
  onClose,
  isPending,
  initialCart,
}: OrderingViewProps) {
  const [cart, setCart] = useState<CartItem[]>(initialCart ?? []);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [comboOpen, setComboOpen] = useState(false);
  const productListRef = useRef<HTMLDivElement>(null);

  const filteredProducts = products.filter(p => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !activeCategory || p.category_id === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const cartItemMap = new Map(cart.filter(i => !i.line_id).map(i => [i.product_id, i]));
  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const addToCart = (product: any) => {
    try { navigator.vibrate?.(30); } catch {}
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, name: product.name, price: Number(product.price), quantity: 1, notes: '' }];
    });
  };

  const updateQuantity = (key: string, delta: number) => {
    try { navigator.vibrate?.(20); } catch {}
    setCart(prev => prev.map(i => lineKey(i) === key ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i).filter(i => i.quantity > 0));
  };

  const updateNotes = (key: string, notes: string) => {
    setCart(prev => prev.map(i => lineKey(i) === key ? { ...i, notes } : i));
  };

  const addCombo = (lines: ComboExpandedLine[]) => {
    try { navigator.vibrate?.(30); } catch {}
    const stamp = Date.now();
    setCart(prev => [
      ...prev,
      ...lines.map((l, idx) => ({
        line_id: `combo-${stamp}-${idx}`,
        product_id: l.product_id,
        name: l.name,
        price: l.price,
        quantity: 1,
        notes: '',
      })),
    ]);
    setCartExpanded(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
        <Button variant="ghost" size="icon" onClick={onClose} className="h-10 w-10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-bold text-lg">
            {isAddingToExisting ? `Agregar — Mesa ${tableNumber}` : `Nuevo pedido — Mesa ${tableNumber}`}
          </h1>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto..."
            value={search}
            onChange={e => { setSearch(e.target.value); setActiveCategory(null); }}
            className="pl-10 h-11"
          />
          {search && (
            <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setSearch('')}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Category chips */}
      <div className="px-4 py-2 border-b shrink-0 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              !activeCategory ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            Todos
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setSearch(''); }}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Combos */}
      {combos.length > 0 && (
        <div className="px-4 py-2 border-b shrink-0">
          <Button
            variant="outline"
            className="w-full h-11 gap-2 border-amber-500/40 text-amber-600"
            onClick={() => setComboOpen(true)}
          >
            <UtensilsCrossed className="h-4 w-4" />
            Combos del día
          </Button>
        </div>
      )}

      {/* Product list */}
      <div ref={productListRef} className="flex-1 overflow-y-auto px-4 py-2 pb-28">
        {filteredProducts.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No se encontraron productos</p>
        ) : (
          <div className="space-y-1">
            {filteredProducts.map(p => {
              const inCart = cartItemMap.get(p.id);
              return (
                <div key={p.id} className="flex items-center gap-3 py-3 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <p className="text-sm text-muted-foreground">${Number(p.price).toFixed(2)}</p>
                  </div>
                  {inCart ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-11 w-11 rounded-full"
                        onClick={() => updateQuantity(p.id, -1)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center font-bold text-lg">{inCart.quantity}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-11 w-11 rounded-full"
                        onClick={() => updateQuantity(p.id, 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="icon"
                      className="h-11 w-11 rounded-full shrink-0"
                      onClick={() => addToCart(p)}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating cart bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg">
          {/* Expanded cart */}
          {cartExpanded && (
            <div className="max-h-[50vh] overflow-y-auto px-4 py-3 space-y-3 border-b">
              {cart.map(item => (
                <div key={lineKey(item)} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-medium text-sm truncate">{item.name}</span>
                      <button
                        onClick={() => setEditingNote(editingNote === lineKey(item) ? null : lineKey(item))}
                        className={`shrink-0 p-1 rounded ${item.notes ? 'text-primary' : 'text-muted-foreground'}`}
                      >
                        <StickyNote className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="icon" variant="outline" className="h-9 w-9 rounded-full" onClick={() => updateQuantity(lineKey(item), -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center font-bold">{item.quantity}</span>
                      <Button size="icon" variant="outline" className="h-9 w-9 rounded-full" onClick={() => updateQuantity(lineKey(item), 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <span className="text-sm font-medium w-16 text-right">${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  </div>
                  {editingNote === lineKey(item) && (
                    <Input
                      placeholder="Notas: sin sal, bien cocido..."
                      value={item.notes}
                      onChange={e => updateNotes(lineKey(item), e.target.value)}
                      className="h-9 text-sm"
                      autoFocus
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Bottom bar */}
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => setCartExpanded(!cartExpanded)}
              className="flex items-center gap-2 flex-1"
            >
              <div className="relative">
                <ShoppingCart className="h-6 w-6" />
                <Badge className="absolute -top-2 -right-3 h-5 min-w-5 flex items-center justify-center text-xs px-1">
                  {cartCount}
                </Badge>
              </div>
              <span className="font-bold text-lg ml-2">${cartTotal.toFixed(2)}</span>
            </button>
            <Button
              className="h-12 px-6 gap-2 text-base font-bold"
              onClick={() => onSubmit(cart)}
              disabled={isPending}
            >
              <Send className="h-5 w-5" />
              {isAddingToExisting ? 'Agregar' : 'Enviar'}
            </Button>
          </div>
        </div>
      )}

      <ComboPickerDialog
        combos={combos}
        open={comboOpen}
        onOpenChange={setComboOpen}
        onConfirm={lines => addCombo(lines)}
      />
    </div>
  );
}
