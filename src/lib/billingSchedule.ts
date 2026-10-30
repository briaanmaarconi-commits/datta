// Calendario de un vencimiento de la suscripción (mismas reglas que backend/src/lib/billing.ts):
// aviso 7 días antes, una semana sin recargo, después +10% por semana y suspensión a los 22 días de atraso.

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface DueSchedule {
  noticeFrom: string;
  due: string;
  noSurchargeUntil: string;
  plus10Until: string;
  plus20Until: string;
  suspendOn: string;
}

export function dueSchedule(due: string): DueSchedule {
  return {
    noticeFrom: addDays(due, -7),
    due,
    noSurchargeUntil: addDays(due, 7),
    plus10Until: addDays(due, 14),
    plus20Until: addDays(due, 21),
    suspendOn: addDays(due, 22),
  };
}

/** Día y mes (ej. "1/11") para textos cortos. */
export const shortDate = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

/** Próximo día en que sube el recargo o se suspende, según los días de atraso. */
export function nextStep(due: string, overdueDays: number): { date: string; what: string } {
  const s = dueSchedule(due);
  if (overdueDays <= 7) return { date: addDays(s.noSurchargeUntil, 1), what: 'se suma un 10%' };
  if (overdueDays <= 14) return { date: addDays(s.plus10Until, 1), what: 'el recargo pasa a 20%' };
  return { date: s.suspendOn, what: 'se suspende el servicio' };
}
