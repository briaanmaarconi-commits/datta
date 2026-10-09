import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { CircleHelp, LifeBuoy, Loader2, MessageSquareWarning, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { getSectionHelp } from '@/lib/sectionHelp';
import { buildTicketDraft, type AssistantMsg, type SupportComposeState } from '@/lib/supportAssistant';

// local: aviso del propio panel (error o sin conexión); no se copia en el reclamo
type Msg = AssistantMsg & { handoff?: { title: string | null }; local?: boolean };

const SUGGESTIONS = ['No me imprime la comanda', '¿Cómo cargo un gasto fijo?', '¿Cómo agrego a alguien del equipo?', '¿Cómo facturo una venta?'];
const GREETING = 'Hola, soy el asistente de ayuda de Datta. Contame qué necesitás o qué problema tenés. Si no lo podemos resolver acá, lo pasamos al equipo de Datta.';

/**
 * Botón de ayuda del encabezado: primero intenta resolver la duda con el asistente de soporte y,
 * si no se puede, lleva a Inconvenientes con el reclamo ya escrito.
 */
export default function SupportAssistant({ base }: { base: '/admin' | '/cashier' }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const section = getSectionHelp(pathname);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const history: Msg[] = [...messages, { role: 'user', content }];
    setMessages(history);
    setInput('');
    setLoading(true);
    try {
      const resp = await fetch('/api/fn/support-chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), page: pathname }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.reply) {
        setMessages((m) => [...m, {
          role: 'assistant',
          content: 'Ahora no puedo responderte. Mandale tu consulta al equipo de Datta y te contestan por Inconvenientes.',
          handoff: { title: null },
          local: true,
        }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply, ...(data.handoff ? { handoff: { title: data.handoff.title ?? null } } : {}) }]);
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Se cortó la conexión. Probá de nuevo o mandá tu consulta al equipo de Datta.', handoff: { title: null }, local: true }]);
    } finally {
      setLoading(false);
    }
  }

  function goToSupport(title: string | null) {
    const draft = buildTicketDraft(messages.filter((m) => !m.local).map(({ role, content }) => ({ role, content })), title, section?.title ?? null);
    const state: SupportComposeState = { compose: draft };
    setOpen(false);
    navigate(`${base}/inconvenientes`, { state });
  }

  const asked = messages.some((m) => m.role === 'user');

  return (
    <>
      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setOpen(true)} aria-label="Ayuda">
        <CircleHelp className="h-5 w-5" />
        <span className="hidden sm:inline">Ayuda</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="space-y-1 border-b p-5 text-left">
            <SheetTitle className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary"><LifeBuoy className="h-4 w-4" /></span>
              Ayuda de Datta
            </SheetTitle>
            <SheetDescription>Resolvé tus dudas al instante. Si hace falta, lo pasamos al equipo de Datta.</SheetDescription>
          </SheetHeader>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
            <Bubble role="assistant">{GREETING}</Bubble>
            {!asked && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="space-y-2">
                <Bubble role={m.role}>{m.content}</Bubble>
                {m.handoff && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                    <p className="text-sm">Esto lo tiene que revisar el equipo de Datta. Te armamos el reclamo con lo que hablamos.</p>
                    <Button size="sm" className="mt-2 gap-2" onClick={() => goToSupport(m.handoff!.title)}>
                      <MessageSquareWarning className="h-4 w-4" /> Enviar a Inconvenientes
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Escribiendo…</div>
            )}
          </div>

          <div className="space-y-2 border-t p-4">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
              <Input ref={inputRef} value={input} maxLength={4000} onChange={(e) => setInput(e.target.value)} placeholder="Escribí tu consulta…" disabled={loading} />
              <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
            </form>
            {asked && (
              <button type="button" onClick={() => goToSupport(null)} className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                ¿No se resolvió? Hablar con el equipo de Datta
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: string }) {
  return (
    <div className={cn('flex', role === 'user' && 'justify-end')}>
      <div className={cn(
        'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
        role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-muted/70',
      )}>
        {role === 'assistant'
          ? <div className="max-w-none [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_strong]:font-semibold [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"><ReactMarkdown>{children}</ReactMarkdown></div>
          : <span className="whitespace-pre-wrap">{children}</span>}
      </div>
    </div>
  );
}
