import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Trash2, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`} />
      ))}
    </div>
  );
}

export default function AdminReviewsSection({ establishmentId }: { establishmentId: string }) {
  const queryClient = useQueryClient();

  const { data: productReviews = [] } = useQuery({
    queryKey: ['admin-product-reviews', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_reviews')
        .select('*, products(name)')
        .eq('establishment_id', establishmentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const { data: waiterReviews = [] } = useQuery({
    queryKey: ['admin-waiter-reviews', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('waiter_reviews')
        .select('*')
        .eq('establishment_id', establishmentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const deleteProductReview = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_reviews').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-product-reviews'] });
      toast.success('Reseña eliminada');
    },
    onError: () => toast.error('Error al eliminar reseña'),
  });

  const deleteWaiterReview = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('waiter_reviews').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-waiter-reviews'] });
      toast.success('Reseña eliminada');
    },
    onError: () => toast.error('Error al eliminar reseña'),
  });

  return (
    <Tabs defaultValue="products">
      <TabsList>
        <TabsTrigger value="products">Platos ({productReviews.length})</TabsTrigger>
        <TabsTrigger value="waiters">Mozos ({waiterReviews.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="products" className="space-y-3 mt-4">
        {productReviews.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No hay reseñas de platos</p>
        )}
        {productReviews.map((r: any) => (
          <Card key={r.id}>
            <CardContent className="py-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{r.products?.name || 'Producto'}</Badge>
                  <Stars rating={r.rating} />
                  <span className="text-xs text-muted-foreground">{r.reviewer_name || 'Anónimo'}</span>
                </div>
                {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                <p className="text-[10px] text-muted-foreground/60">{new Date(r.created_at).toLocaleString()}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteProductReview.mutate(r.id)}
                disabled={deleteProductReview.isPending}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </TabsContent>

      <TabsContent value="waiters" className="space-y-3 mt-4">
        {waiterReviews.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No hay reseñas de mozos</p>
        )}
        {waiterReviews.map((r: any) => (
          <Card key={r.id}>
            <CardContent className="py-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{r.waiter_name}</Badge>
                  <Stars rating={r.rating} />
                  <span className="text-xs text-muted-foreground">{r.reviewer_name || 'Anónimo'}</span>
                </div>
                {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                <p className="text-[10px] text-muted-foreground/60">{new Date(r.created_at).toLocaleString()}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteWaiterReview.mutate(r.id)}
                disabled={deleteWaiterReview.isPending}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </TabsContent>
    </Tabs>
  );
}
