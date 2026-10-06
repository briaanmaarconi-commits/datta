import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, UserRound, Eye } from 'lucide-react';
import StarRating from '@/components/client/StarRating';
import PromoBanners from '@/components/client/PromoBanners';
import DailySpecials from '@/components/client/DailySpecials';
import PopularDishes from '@/components/client/PopularDishes';
import ReviewDialog from '@/components/client/ReviewDialog';
import WaiterReviewDialog from '@/components/client/WaiterReviewDialog';
import ProductReviewsDialog from '@/components/client/ProductReviewsDialog';

export default function MenuView() {
  const { establishmentId } = useParams();
  const queryClient = useQueryClient();
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [reviewProduct, setReviewProduct] = useState<{ id: string; name: string } | null>(null);
  const [showWaiterReview, setShowWaiterReview] = useState(false);
  const [viewReviewsProduct, setViewReviewsProduct] = useState<{ id: string; name: string } | null>(null);

  const { data: establishment, isLoading: loadingEst, error: estError } = useQuery({
    queryKey: ['establishment-view', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('public_establishments' as any)
        .select('id, name, logo_url')
        .eq('id', establishmentId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { id: string; name: string; logo_url: string | null } | null;
    },
    enabled: !!establishmentId,
  });

  const { data: categories = [], error: categoriesError } = useQuery({
    queryKey: ['view-categories', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('categories')
        .select('id, name, sort_order, image_url')
        .eq('establishment_id', establishmentId!)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!establishmentId,
  });

  const { data: products = [], isLoading: loadingProducts, error: productsError } = useQuery({
    queryKey: ['view-products', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('products').select('id, name, description, price, image_url, category_id, is_available, promo_active, promo_price, is_daily_special').eq('establishment_id', establishmentId!).eq('is_available', true).order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });


  const { data: combos = [] } = useQuery({
    queryKey: ['view-combos', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('menu_combos')
        .select('id, name, description, image_url, price, is_active, menu_combo_items(id, product_id, item_group, sort_order, products(name, price))')
        .eq('establishment_id', establishmentId!)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!establishmentId,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['product-reviews', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('product_reviews' as any).select('*').eq('establishment_id', establishmentId!).order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!establishmentId,
  });

  // Compute average ratings per product
  const avgRatings: Record<string, { avg: number; count: number }> = {};
  reviews.forEach((r: any) => {
    if (!avgRatings[r.product_id]) avgRatings[r.product_id] = { avg: 0, count: 0 };
    avgRatings[r.product_id].count++;
    avgRatings[r.product_id].avg += r.rating;
  });
  Object.values(avgRatings).forEach(v => { v.avg = v.avg / v.count; });

  const promoProducts = products.filter(p => p.promo_active && p.promo_price != null);
  const popularProducts = [...products].sort((a, b) => (avgRatings[b.id]?.count || 0) - (avgRatings[a.id]?.count || 0)).slice(0, 5).filter(p => avgRatings[p.id]?.count > 0);
  
  // Find dessert category
  const dessertCat = categories.find(c => c.name.toLowerCase().includes('postre') || c.name.toLowerCase().includes('dessert'));
  const dessertProducts = dessertCat ? products.filter(p => p.category_id === dessertCat.id) : [];

  const filteredProducts = selectedCat ? products.filter(p => p.category_id === selectedCat) : products;

  if (loadingEst || loadingProducts) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (estError || categoriesError || productsError || !establishment) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold">No pudimos cargar la carta</h1>
          <p className="text-muted-foreground">Revisá tu conexión e intentá nuevamente.</p>
          <Button onClick={() => window.location.reload()}>Reintentar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary">datta</h1>
            <p className="text-xs text-muted-foreground">{establishment.name}</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setShowWaiterReview(true)}>
            <UserRound className="h-3.5 w-3.5" />
            Calificar mozo
          </Button>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Daily Specials */}
        <DailySpecials products={products} categories={categories} combos={combos} />

        {/* Popular Dishes */}
        <PopularDishes products={products} avgRatings={avgRatings} />

        {/* Banners */}
        <PromoBanners
          promoProducts={promoProducts}
          popularProducts={popularProducts}
          dessertProducts={dessertProducts}
        />

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
        {filteredProducts.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No hay productos disponibles</p>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map(p => {
              const r = avgRatings[p.id];
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
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex gap-1 items-center">
                            {p.promo_active && p.promo_price != null ? (
                              <>
                                <Badge className="bg-orange-500 hover:bg-orange-600">${Number(p.promo_price).toFixed(2)}</Badge>
                                <Badge variant="outline" className="line-through text-muted-foreground">${Number(p.price).toFixed(2)}</Badge>
                              </>
                            ) : (
                              <Badge className="w-fit">${Number(p.price).toFixed(2)}</Badge>
                            )}
                            {r && r.count > 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] gap-0.5 px-1.5 text-muted-foreground"
                                onClick={() => setViewReviewsProduct({ id: p.id, name: p.name })}
                              >
                                <Eye className="h-3 w-3" /> Ver reseñas ({r.count})
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <div className="flex items-center gap-1">
                            <StarRating rating={Math.round(r?.avg || 0)} size="sm" readonly />
                            {r && <span className="text-xs text-muted-foreground">({r.count})</span>}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1 text-primary"
                            onClick={() => setReviewProduct({ id: p.id, name: p.name })}
                          >
                            <MessageSquare className="h-3 w-3" /> Reseñar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {reviewProduct && (
        <ReviewDialog
          open={!!reviewProduct}
          onOpenChange={open => !open && setReviewProduct(null)}
          productId={reviewProduct.id}
          productName={reviewProduct.name}
          establishmentId={establishmentId!}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['product-reviews', establishmentId] })}
        />
      )}

      <WaiterReviewDialog
        open={showWaiterReview}
        onOpenChange={setShowWaiterReview}
        establishmentId={establishmentId!}
        onSuccess={() => {}}
      />

      {viewReviewsProduct && (
        <ProductReviewsDialog
          open={!!viewReviewsProduct}
          onOpenChange={open => !open && setViewReviewsProduct(null)}
          productName={viewReviewsProduct.name}
          reviews={reviews.filter((r: any) => r.product_id === viewReviewsProduct.id)}
        />
      )}
    </div>
  );
}
