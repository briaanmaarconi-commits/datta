import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Inbox, Loader2, MessageSquareWarning, PenSquare } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TicketThread from '@/components/support/TicketThread';
import {
  DESCRIPTION_MAX, DESCRIPTION_MIN, STATUS_CLASS, STATUS_LABEL, SUPPORT_KEY, TITLE_MAX, TITLE_MIN,
  useSupportRealtime, type SupportTicket,
} from '@/lib/support';

/** Inconvenientes del local: reportar un problema a Datta y seguir la conversación. */
export default function ClientSupport() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useSupportRealtime();

  const listKey = [...SUPPORT_KEY, 'client', establishmentId];
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: listKey,
    enabled: !!establishmentId,
    queryFn: async () => {
      const { data, error } = await db
        .from('support_tickets')
        .select('*, profiles:created_by(full_name, email)')
        .eq('establishment_id', establishmentId!)
        .order('last_message_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupportTicket[];
    },
  });

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  // Al abrir uno con respuesta nueva, se marca como leída.
  useEffect(() => {
    if (!selected?.client_unread) return;
    void db.from('support_tickets').update({ client_unread: false }).eq('id', selected.id)
      .then(() => queryClient.invalidateQueries({ queryKey: SUPPORT_KEY }));
  }, [selected?.id, selected?.client_unread, queryClient]);

  return (
    // pb: en el celular los botones flotantes (chat, calculadora) no tapan "Responder".
    <div className="space-y-6 pb-32 lg:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inconvenientes</h1>
          <p className="mt-1 text-muted-foreground">Contanos cualquier problema con el sistema. El equipo de Datta te responde por acá.</p>
        </div>
        <Button onClick={() => setComposeOpen(true)} className="gap-2">
          <PenSquare className="h-4 w-4" /> Nuevo inconveniente
        </Button>
      </div>

      <div className="grid overflow-hidden rounded-xl border bg-card lg:h-[calc(100vh-14rem)] lg:min-h-[480px] lg:grid-cols-[minmax(280px,380px)_1fr]">
        <div className={cn('min-h-0 overflow-y-auto border-b lg:border-b-0 lg:border-r', selected && 'hidden lg:block')}>
          {isLoading ? (
            <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <MessageSquareWarning className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Todavía no enviaste ningún inconveniente</p>
              <p className="text-sm text-muted-foreground">Si algo no funciona como esperás, contanos los detalles y lo revisamos.</p>
              <Button variant="outline" onClick={() => setComposeOpen(true)}>Reportar un inconveniente</Button>
            </div>
          ) : (
            <ul>
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      'w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/60',
                      t.id === selectedId && 'bg-muted',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {t.client_unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Respuesta nueva" />}
                      <span className={cn('min-w-0 flex-1 truncate', t.client_unread ? 'font-semibold' : 'font-medium')}>{t.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(t.last_message_at), { locale: es, addSuffix: false })}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="outline" className={cn('text-[11px]', STATUS_CLASS[t.status])}>{STATUS_LABEL[t.status]}</Badge>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {t.client_unread ? 'Datta te respondió' : t.description}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cn('min-h-0', !selected && 'hidden lg:block')}>
          {selected ? (
            <div className="flex h-full min-h-[520px] flex-col lg:min-h-0">
              <div className="border-b p-2 lg:hidden">
                <Button variant="ghost" size="sm" className="gap-2" onClick={() => setSelectedId(null)}>
                  <ArrowLeft className="h-4 w-4" /> Volver
                </Button>
              </div>
              <div className="min-h-0 flex-1"><TicketThread key={selected.id} ticket={selected} viewer="client" /></div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
              <Inbox className="h-10 w-10" />
              <p>Elegí un inconveniente para ver la conversación</p>
            </div>
          )}
        </div>
      </div>

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        establishmentId={establishmentId}
        onSent={(ticket) => {
          // Aparece al instante en la lista; la recarga trae los datos completos.
          queryClient.setQueryData<SupportTicket[]>(listKey, (old = []) => [ticket, ...old.filter((t) => t.id !== ticket.id)]);
          queryClient.invalidateQueries({ queryKey: SUPPORT_KEY });
          setSelectedId(ticket.id);
        }}
      />
    </div>
  );
}

function ComposeDialog({ open, onOpenChange, establishmentId, onSent }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  establishmentId: string | null;
  onSent: (ticket: SupportTicket) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);

  const titleLen = title.trim().length;
  const descLen = description.trim().length;
  const titleOk = titleLen >= TITLE_MIN;
  const descOk = descLen >= DESCRIPTION_MIN;

  async function submit() {
    setTouched(true);
    if (!titleOk || !descOk || !establishmentId) return;
    setSending(true);
    const { data, error } = await db
      .from('support_tickets')
      .insert({ establishment_id: establishmentId, title: title.trim(), description: description.trim() })
      .select('*, profiles:created_by(full_name, email)')
      .single();
    setSending(false);
    if (error) {
      toast.error(error.message || 'No se pudo enviar el inconveniente');
      return;
    }
    toast.success('Inconveniente enviado. Te vamos a responder por acá.');
    setTitle('');
    setDescription('');
    setTouched(false);
    onOpenChange(false);
    onSent(data as SupportTicket);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo inconveniente</DialogTitle>
          <DialogDescription>Cuanto más detalle nos des, más rápido lo podemos resolver.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="ticket-title">Título del problema</Label>
            <Input
              id="ticket-title"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: La impresora de cocina no imprime las comandas"
            />
            {touched && !titleOk && <p className="text-sm text-destructive">Escribí un título de al menos {TITLE_MIN} caracteres.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ticket-description">Desarrollo del inconveniente</Label>
            <Textarea
              id="ticket-description"
              value={description}
              maxLength={DESCRIPTION_MAX}
              rows={9}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={'Explicá en detalle qué pasó:\n• ¿Qué estabas haciendo y en qué pantalla?\n• ¿Qué esperabas que pasara y qué pasó?\n• ¿Desde cuándo ocurre y cada cuánto?\n• ¿Apareció algún mensaje de error?'}
            />
            <div className="flex justify-between gap-2 text-xs">
              <span className={cn(touched && !descOk ? 'text-destructive' : 'text-muted-foreground')}>
                {descOk ? 'Gracias por el detalle.' : `Mínimo ${DESCRIPTION_MIN} caracteres (faltan ${DESCRIPTION_MIN - descLen}).`}
              </span>
              <span className="text-muted-foreground">{description.length}/{DESCRIPTION_MAX}</span>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
          <Button onClick={submit} disabled={sending} className="gap-2">
            {sending && <Loader2 className="h-4 w-4 animate-spin" />} Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
