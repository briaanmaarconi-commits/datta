import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { DESCRIPTION_MAX, STATUS_CLASS, STATUS_LABEL, SUPPORT_KEY, type SupportMessage, type SupportTicket } from '@/lib/support';

const when = (d: string) => format(new Date(d), "d 'de' MMM yyyy, HH:mm", { locale: es });

/** Detalle de un inconveniente: el problema original, la conversación y la caja para responder. */
export default function TicketThread({ ticket, viewer, actions }: {
  ticket: SupportTicket;
  viewer: 'client' | 'datta';
  actions?: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const messagesKey = [...SUPPORT_KEY, 'messages', ticket.id];
  const { data: messages = [], isLoading } = useQuery({
    queryKey: messagesKey,
    queryFn: async () => {
      const { data, error } = await db
        .from('support_ticket_messages')
        .select('*, profiles:author_id(full_name, email)')
        .eq('ticket_id', ticket.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SupportMessage[];
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  const author = ticket.profiles?.full_name || ticket.profiles?.email || 'Personal del local';

  async function send() {
    const body = reply.trim();
    if (!body) return;
    setSending(true);
    const { data, error } = await db
      .from('support_ticket_messages')
      .insert({ ticket_id: ticket.id, body })
      .select('*, profiles:author_id(full_name, email)')
      .single();
    setSending(false);
    if (error) {
      toast.error(error.message || 'No se pudo enviar la respuesta');
      return;
    }
    setReply('');
    const sent = data as SupportMessage;
    queryClient.setQueryData<SupportMessage[]>(messagesKey, (old = []) => [...old.filter((m) => m.id !== sent.id), sent]);
    queryClient.invalidateQueries({ queryKey: SUPPORT_KEY });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 break-words text-xl font-semibold leading-tight">{ticket.title}</h2>
          <Badge variant="outline" className={STATUS_CLASS[ticket.status]}>{STATUS_LABEL[ticket.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {viewer === 'datta' && <><strong className="text-foreground">{ticket.establishments?.name ?? 'Local'}</strong> · </>}
          {author} · {when(ticket.created_at)}
        </p>
        {actions}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <div className="whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">{ticket.description}</div>

        {isLoading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {messages.map((m) => {
          const mine = viewer === 'datta' ? m.from_datta : !m.from_datta;
          const name = m.from_datta ? 'Equipo Datta' : (m.profiles?.full_name || m.profiles?.email || 'Personal del local');
          return (
            <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] rounded-lg px-4 py-3 text-sm',
                mine ? 'bg-primary text-primary-foreground' : 'border bg-card',
              )}>
                <div className={cn('mb-1 text-xs font-medium', mine ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                  {name} · {when(m.created_at)}
                </div>
                <div className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="space-y-2 border-t p-4 sm:p-6">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          maxLength={DESCRIPTION_MAX}
          rows={3}
          placeholder={viewer === 'datta' ? 'Escribí una respuesta para el cliente…' : 'Agregá información o respondé al equipo de Datta…'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send();
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">Ctrl + Enter para enviar</span>
          <Button onClick={send} disabled={!reply.trim() || sending} className="ml-auto gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Responder
          </Button>
        </div>
      </div>
    </div>
  );
}
