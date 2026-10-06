import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import StarRating from './StarRating';
import { publicPost } from '@/lib/db';
import { toast } from 'sonner';

interface WaiterReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  establishmentId: string;
  onSuccess: () => void;
}

export default function WaiterReviewDialog({ open, onOpenChange, establishmentId, onSuccess }: WaiterReviewDialogProps) {
  const [rating, setRating] = useState(0);
  const [waiterName, setWaiterName] = useState('');
  const [comment, setComment] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (rating === 0) { toast.error('Seleccioná una calificación'); return; }
    if (!waiterName.trim()) { toast.error('Ingresá el nombre del mozo'); return; }
    setLoading(true);
    const res = await publicPost('/api/public/waiter-reviews', {
      establishmentId,
      waiterName: waiterName.trim(),
      rating,
      comment: comment || null,
      reviewerName: reviewerName || null,
    });
    setLoading(false);
    if (!res.ok) { toast.error('Error al enviar calificación'); return; }
    toast.success('¡Gracias por calificar al mozo!');
    setRating(0); setWaiterName(''); setComment(''); setReviewerName('');
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Calificar al mozo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-center">
            <StarRating rating={rating} onRate={setRating} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Nombre del mozo</Label>
            <Input placeholder="¿Quién te atendió?" value={waiterName} onChange={e => setWaiterName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Tu nombre (opcional)</Label>
            <Input placeholder="Anónimo" value={reviewerName} onChange={e => setReviewerName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Comentario (opcional)</Label>
            <Textarea placeholder="¿Cómo fue la atención?" value={comment} onChange={e => setComment(e.target.value)} className="h-20" />
          </div>
          <Button className="w-full" onClick={submit} disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar calificación'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
