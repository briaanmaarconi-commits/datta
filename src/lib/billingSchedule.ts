// Calendario de un vencimiento de la suscripción (mismas reglas que backend/src/lib/billing.ts):
// aviso 7 días antes, primera semana de atraso +6%, segunda +12% y suspensión a los 15 días de atraso.

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface DueSchedule {
  noticeFrom: string;
  due: string;
  plus6Until: string;
  plus12Until: string;
  suspendOn: string;
}

export function dueSchedule(due: string): DueSchedule {
  return {
    noticeFrom: addDays(due, -7),
    due,
    plus6Until: addDays(due, 7),
    plus12Until: addDays(due, 14),
    suspendOn: addDays(due, 15),
  };
}

/** Día y mes (ej. "1/11") para textos cortos. */
export const shortDate = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

/** Próximo día en que sube el recargo o se suspende, según los días de atraso. */
export function nextStep(due: string, overdueDays: number): { date: string; what: string } {
  const s = dueSchedule(due);
  if (overdueDays <= 7) return { date: addDays(s.plus6Until, 1), what: 'el recargo pasa a 12%' };
  return { date: s.suspendOn, what: 'se suspende el sistema' };
}
