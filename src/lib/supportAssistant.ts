import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX, TITLE_MIN } from '@/lib/support';

export type AssistantMsg = { role: 'user' | 'assistant'; content: string };
export type TicketDraft = { title: string; description: string };

/** Estado que viaja a Inconvenientes para abrir el formulario ya completo. */
export type SupportComposeState = { compose: TicketDraft };

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);

/**
 * Arma el borrador del inconveniente a partir de la charla con el asistente:
 * título sugerido (o la primera consulta) y una descripción con la conversación.
 */
export function buildTicketDraft(messages: AssistantMsg[], suggestedTitle?: string | null, sectionTitle?: string | null): TicketDraft {
  const userMsgs = messages.filter((m) => m.role === 'user').map((m) => m.content.trim()).filter(Boolean);
  const first = userMsgs[0] ?? '';

  let title = (suggestedTitle ?? '').trim() || first.split('\n')[0];
  title = clip(title, TITLE_MAX);
  if (title.length < TITLE_MIN) title = 'Consulta desde el asistente de ayuda';

  const lines = [
    userMsgs.length ? `Qué me pasa:\n${userMsgs.join('\n')}` : '',
    sectionTitle ? `Sección donde estaba: ${sectionTitle}` : '',
    messages.length > 1
      ? 'Conversación con el asistente:\n' + messages.map((m) => `${m.role === 'user' ? 'Yo' : 'Asistente'}: ${m.content.trim()}`).join('\n')
      : '',
  ].filter(Boolean);
  let description = clip(lines.join('\n\n'), DESCRIPTION_MAX);
  if (description.length < DESCRIPTION_MIN) description = description + (description ? '\n\n' : '') + 'Escribí acá más detalles del problema.';

  return { title, description };
}

export function isSupportComposeState(s: unknown): s is SupportComposeState {
  const c = (s as SupportComposeState | null)?.compose;
  return !!c && typeof c.title === 'string' && typeof c.description === 'string';
}
