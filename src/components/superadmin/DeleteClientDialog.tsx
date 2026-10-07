import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { clientsApi } from '@/lib/billingApi';

interface Preview {
  name: string;
  orders: number;
  fiscal_invoices: number;
  products: number;
  payments: number;
  users: number;
  mp_preapproval_id: string | null;
  mp_status: string | null;
  last_order_at: string | null;
  has_data: boolean;
}

/**
 * Confirmación para eliminar un cliente (restaurante). Muestra qué se borra y, si el cliente tiene movimientos reales,
 * pide escribir su nombre. El servidor vuelve a validar el nombre y guarda una copia de seguridad antes de borrar.
 */
export default function DeleteClientDialog({ client, onClose }: { client: { id: string; name: string } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [typed, setTyped] = useState('');

  const { data: preview, isLoading, error } = useQuery({
    queryKey: ['delete-preview', client?.id],
    queryFn: () => clientsApi<Preview>('delete-preview', { establishment_id: client!.id }),
    enabled: !!client,
    staleTime: 0,
    gcTime: 0,
  });

  const remove = useMutation({
    mutationFn: () => clientsApi<{ ok: true; backup: string }>('delete', { establishment_id: client!.id, confirm_name: client!.name }),
    onSuccess: (r) => {
      for (const key of ['sa-clients', 'sa-client-payments', 'billing-overview', 'sa-users']) qc.invalidateQueries({ queryKey: [key] });
      toast.success(`Cliente "${client!.name}" eliminado. Copia de seguridad guardada en el servidor (${r.backup}).`, { duration: 9000 });
      handleClose(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleClose = (force = false) => {
    if (remove.isPending && !force) return;
    setTyped('');
    onClose();
  };

  const needsTyping = !!preview?.has_data;
  const canDelete = !!preview && !remove.isPending && (!needsTyping || typed.trim() === client?.name.trim());

  return (
    <AlertDialog open={!!client} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> ¿Seguro que querés eliminar a «{client?.name}»?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>Se borra el cliente y todo lo suyo. <strong>Esta acción no se puede deshacer desde la aplicación.</strong></p>
              {isLoading && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Revisando qué contiene…</p>}
              {error && <p className="text-destructive">No se pudo revisar el cliente: {(error as Error).message}</p>}
              {preview && (
                <>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>{preview.orders.toLocaleString('es-AR')} pedidos{preview.last_order_at ? ` (el último, el ${new Date(preview.last_order_at).toLocaleDateString('es-AR')})` : ''}</li>
                    <li>{preview.fiscal_invoices.toLocaleString('es-AR')} facturas fiscales</li>
                    <li>{preview.products.toLocaleString('es-AR')} productos de la carta</li>
                    <li>{preview.users.toLocaleString('es-AR')} usuarios (sus cuentas de acceso)</li>
                    <li>{preview.payments.toLocaleString('es-AR')} pagos de suscripción</li>
                    <li>Mesas, stock, compras, caja, reservas, reseñas, certificado AFIP y archivos</li>
                    {preview.mp_preapproval_id && preview.mp_status !== 'cancelled' && <li>Se cancela su suscripción en Mercado Pago</li>}
                  </ul>
                  <p className="text-muted-foreground">Antes de borrar, el servidor guarda una copia de seguridad completa. Los movimientos que ya están en la Caja Datta se conservan.</p>
                  {needsTyping && (
                    <div className="space-y-2 rounded-md border border-destructive/40 p-3">
                      <Label htmlFor="confirm-name" className="text-foreground">Para confirmar, escribí el nombre del cliente: <strong>{client?.name}</strong></Label>
                      <Input id="confirm-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" placeholder={client?.name} />
                    </div>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => handleClose()} disabled={remove.isPending}>Cancelar</Button>
          <Button variant="destructive" disabled={!canDelete} onClick={() => remove.mutate()}>
            {remove.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Eliminando…</> : 'Sí, eliminar'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
