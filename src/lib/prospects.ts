import { toArgDate } from '@/lib/utils';

export const PROSPECT_STATUSES = {
  pending: 'Pendiente de contactar',
  contacted: 'Contactado',
  follow_up: 'En seguimiento',
  client: 'Cliente',
  discarded: 'Descartado',
};
export const ACTIVITY_KINDS = { visit: 'Visita', call: 'Llamada', whatsapp: 'WhatsApp' };
export const ACTIVITY_STATUSES = { pending: 'Pendiente', completed: 'Realizada', cancelled: 'Cancelada' };

export function toArgentinaInput(value: string | Date = new Date()): string {
  const date = new Date(value);
  const time = date.toLocaleTimeString('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return toArgDate(date) + 'T' + time;
}

export function fromArgentinaInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Ingresá una fecha y hora válidas');
  const date = new Date(value + ':00-03:00');
  if (!Number.isFinite(date.getTime()) || toArgentinaInput(date) !== value) throw new Error('Ingresá una fecha y hora válidas');
  return date.toISOString();
}

export function whatsappUrl(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? 'https://wa.me/' + digits : null;
}

export function agendaMatches(
  activity: { status: string; scheduled_at: string },
  filter: string,
  day: string,
  now = new Date(),
): boolean {
  if (filter === 'completed') return activity.status === 'completed';
  if (filter === 'cancelled') return activity.status === 'cancelled';
  if (activity.status !== 'pending') return false;
  if (filter === 'today') return toArgDate(activity.scheduled_at) === toArgDate(now);
  if (filter === 'overdue') return new Date(activity.scheduled_at).getTime() < now.getTime();
  if (filter === 'day') return toArgDate(activity.scheduled_at) === day;
  return true;
}
