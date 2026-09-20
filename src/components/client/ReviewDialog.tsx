import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import StarRating from './StarRating';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  establishmentId: string;
  onSuccess: () => void;
}

export default function ReviewDialog({ open, onOpenChange, productId, productName, establishmentId, onSuccess }: ReviewDialogProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (rating === 0) { toast.error('Seleccioná una calificación'); return; }
    setLoading(true);
    const { error } = await supabase.from('product_reviews' as any).insert({
      product_id: productId,
      establishment_id: establishmentId,
      rating,
      comment: comment || null,
      reviewer_name: name || null,
    });
    setLoading(false);
    if (error) { toast.error('Error al enviar reseña'); return; }
    toast.success('¡Gracias por tu reseña!');
    setRating(0); setComment(''); setName('');
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Calificar {productName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-center">
            <StarRating rating={rating} onRate={setRating} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Tu nombre (opcional)</Label>
            <Input placeholder="Anónimo" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Comentario (opcional)</Label>
            <Textarea placeholder="¿Qué te pareció?" value={comment} onChange={e => setComment(e.target.value)} className="h-20" />
          </div>
          <Button className="w-full" onClick={submit} disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar reseña'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
