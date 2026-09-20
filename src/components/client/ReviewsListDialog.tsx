import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import StarRating from './StarRating';
import { MessageSquare, UserRound } from 'lucide-react';

interface ReviewsListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productReviews: any[];
  waiterReviews: any[];
  products: any[];
}

export default function ReviewsListDialog({ open, onOpenChange, productReviews, waiterReviews, products }: ReviewsListDialogProps) {
  const productMap: Record<string, string> = {};
  products.forEach(p => { productMap[p.id] = p.name; });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Calificaciones</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="products" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="products" className="gap-1 text-xs">
              <MessageSquare className="h-3 w-3" /> Platos ({productReviews.length})
            </TabsTrigger>
            <TabsTrigger value="waiters" className="gap-1 text-xs">
              <UserRound className="h-3 w-3" /> Mozos ({waiterReviews.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="products" className="flex-1 overflow-y-auto space-y-2 mt-2">
            {productReviews.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">No hay reseñas de platos aún</p>
            ) : (
              productReviews.map((r: any) => (
                <Card key={r.id} className="shadow-sm">
                  <CardContent className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-xs">{productMap[r.product_id] || 'Producto'}</span>
                      <StarRating rating={r.rating} size="sm" readonly />
                    </div>
                    {r.comment && <p className="text-xs text-muted-foreground">{r.comment}</p>}
                    <p className="text-[10px] text-muted-foreground/70">
                      — {r.reviewer_name || 'Anónimo'} · {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
          <TabsContent value="waiters" className="flex-1 overflow-y-auto space-y-2 mt-2">
            {waiterReviews.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">No hay calificaciones de mozos aún</p>
            ) : (
              waiterReviews.map((r: any) => (
                <Card key={r.id} className="shadow-sm">
                  <CardContent className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-xs">{r.waiter_name}</span>
                      <StarRating rating={r.rating} size="sm" readonly />
                    </div>
                    {r.comment && <p className="text-xs text-muted-foreground">{r.comment}</p>}
                    <p className="text-[10px] text-muted-foreground/70">
                      — {r.reviewer_name || 'Anónimo'} · {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
