import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Minus, ShoppingCart, Send, X } from 'lucide-react';
import DailySpecials from '@/components/client/DailySpecials';
import CallWaiterButton from '@/components/client/CallWaiterButton';

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
}

export default function ClientMenu() {
  const { tableId } = useParams();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [orderSent, setOrderSent] = useState(false);

  const { data: table } = useQuery({
    queryKey: ['client-table', tableId],
    queryFn: async () => {
      const { data, error } = await supabase.from("tables").select("id, number, establishment_id, sector_id, capacity").eq('id', tableId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!tableId,
  });

  const { data: establishment } = useQuery({
    queryKey: ['client-establishment', table?.establishment_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('public_establishments' as any).select('id, name').eq('id', table!.establishment_id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!table?.establishment_id,
  });


  const { data: categories = [] } = useQuery({
    queryKey: ['client-categories', table?.establishment_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('id, name, sort_order, image_url').eq('establishment_id', table!.establishment_id).eq('is_active', true).order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!table?.establishment_id,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['client-products', table?.establishment_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name, description, price, image_url, category_id, is_available, promo_active, promo_price, is_daily_special').eq('establishment_id', table!.establishment_id).eq('is_available', true).order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!table?.establishment_id,
  });


  const { data: combos = [] } = useQuery({
    queryKey: ['client-combos', table?.establishment_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_combos')
        .select('id, name, description, image_url, price, is_active, menu_combo_items(id, product_id, item_group, sort_order, products(name, price))')
        .eq('establishment_id', table!.establishment_id)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!table?.establishment_id,
  });

  const placeOrder = useMutation({
    mutationFn: async () => {
      const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
      const { data: order, error } = await supabase.from('orders').insert({
        table_id: tableId!,
        establishment_id: table!.establishment_id,
        total,
        created_by: null,
      }).select().single();
      if (error) throw error;

      const items = cart.map(i => ({
        order_id: order.id,
        product_id: i.product_id,
        quantity: i.quantity,
        notes: i.notes || null,
        unit_price: i.price,
      }));
      const { error: itemsError } = await supabase.from('order_items').insert(items);
      if (itemsError) throw itemsError;

      await supabase.from('tables').update({ status: 'occupied' as any }).eq('id', tableId!);
    },
    onSuccess: () => {
      toast.success('¡Pedido enviado!');
      setCart([]);
      setShowCart(false);
      setOrderSent(true);
    },
    onError: () => toast.error('Error al enviar pedido'),
  });

  const addToCart = (p: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === p.id);
      if (existing) return prev.map(i => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: p.id, name: p.name, price: Number(p.price), quantity: 1, notes: '' }];
    });
  };

  const updateQty = (id: string, d: number) => {
    setCart(prev => prev.map(i => i.product_id === id ? { ...i, quantity: Math.max(0, i.quantity + d) } : i).filter(i => i.quantity > 0));
  };

  const updateNotes = (id: string, notes: string) => {
    setCart(prev => prev.map(i => i.product_id === id ? { ...i, notes } : i));
  };

  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const filteredProducts = selectedCat ? products.filter(p => p.category_id === selectedCat) : products;

  if (!table) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  if (orderSent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-sm w-full text-center">
          <CardContent className="py-12 space-y-4">
            <div className="text-6xl">✅</div>
            <h2 className="text-2xl font-bold">¡Pedido enviado!</h2>
            <p className="text-muted-foreground">Tu pedido fue enviado a cocina. Te avisaremos cuando esté listo.</p>
            <Button onClick={() => setOrderSent(false)} variant="outline">Hacer otro pedido</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary">datta</h1>
            <p className="text-xs text-muted-foreground">{establishment?.name} — Mesa {table.number}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Call Waiter */}
        <CallWaiterButton
          tableId={tableId!}
          establishmentId={table.establishment_id}
          sectorId={table.sector_id}
        />

        {/* Daily Specials */}
        <DailySpecials products={products} categories={categories} combos={combos} />

        {/* Category filters */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <Button size="sm" variant={!selectedCat ? 'default' : 'outline'} onClick={() => setSelectedCat(null)}>Todo</Button>
          {categories.map(c => (
            <Button key={c.id} size="sm" variant={selectedCat === c.id ? 'default' : 'outline'} onClick={() => setSelectedCat(c.id)} className="whitespace-nowrap">
              {c.name}
            </Button>
          ))}
        </div>

        {/* Products */}
        <div className="space-y-3">
          {filteredProducts.map(p => {
            const inCart = cart.find(i => i.product_id === p.id);
            return (
              <Card key={p.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex">
                    {p.image_url && (
                      <div className="w-24 h-24 flex-shrink-0">
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    )}
                    <div className="flex-1 p-3 flex flex-col justify-between">
                      <div>
                        <h3 className="font-semibold text-sm">{p.name}</h3>
                        {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                      </div>
                      <Badge className="mt-1 w-fit">${Number(p.price).toFixed(2)}</Badge>
                    </div>
                    <div className="flex items-center gap-1 pr-3 pt-2">
                      {inCart ? (
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(p.id, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="font-bold w-5 text-center text-sm">{inCart.quantity}</span>
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(p.id, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" className="h-7 text-xs" onClick={() => addToCart(p)}>
                          <Plus className="h-3 w-3 mr-1" /> Agregar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Cart FAB */}
      {cartCount > 0 && !showCart && (
        <div className="fixed bottom-4 left-0 right-0 px-4">
          <div className="max-w-lg mx-auto">
            <Button className="w-full gap-2 h-14 text-lg shadow-lg" onClick={() => setShowCart(true)}>
              <ShoppingCart className="h-5 w-5" />
              Ver pedido ({cartCount}) — ${cartTotal.toFixed(2)}
            </Button>
          </div>
        </div>
      )}

      {/* Cart Sheet */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => setShowCart(false)}>
          <div className="fixed bottom-0 left-0 right-0 bg-card border-t rounded-t-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="max-w-lg mx-auto p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Tu pedido</h2>
                <Button size="icon" variant="ghost" onClick={() => setShowCart(false)}><X className="h-5 w-5" /></Button>
              </div>

              {cart.map(item => (
                <div key={item.product_id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{item.name}</span>
                    <span>${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(item.product_id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="font-bold w-8 text-center">{item.quantity}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(item.product_id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Notas especiales..."
                    className="text-sm h-16"
                    value={item.notes}
                    onChange={e => updateNotes(item.product_id, e.target.value)}
                  />
                </div>
              ))}

              <div className="border-t pt-3 flex items-center justify-between font-bold text-lg">
                <span>Total</span>
                <span>${cartTotal.toFixed(2)}</span>
              </div>

              <Button className="w-full gap-2 h-14 text-lg" onClick={() => placeOrder.mutate()} disabled={placeOrder.isPending}>
                <Send className="h-5 w-5" />
                {placeOrder.isPending ? 'Enviando...' : 'Confirmar pedido'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
