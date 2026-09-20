import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import StarRating from './StarRating';

interface ProductReviewsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  reviews: any[];
}

export default function ProductReviewsDialog({ open, onOpenChange, productName, reviews }: ProductReviewsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Reseñas de {productName}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2">
          {reviews.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">No hay reseñas aún</p>
          ) : (
            reviews.map((r: any) => (
              <Card key={r.id} className="shadow-sm">
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs">{r.reviewer_name || 'Anónimo'}</span>
                    <StarRating rating={r.rating} size="sm" readonly />
                  </div>
                  {r.comment && <p className="text-xs text-muted-foreground">{r.comment}</p>}
                  <p className="text-[10px] text-muted-foreground/70">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
