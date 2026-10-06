// Argentina no usa horario de verano (UTC-3 fijo): los "días" del negocio se calculan en ART, no en UTC.
const ART_OFFSET_HOURS = 3;

export function artDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d); // YYYY-MM-DD
}

export function artHour(d = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", hour12: false }).format(d),
  ) % 24;
}

/** Instante en que empieza (00:00 ART) el día "YYYY-MM-DD". */
export function artMidnight(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, ART_OFFSET_HOURS, 0, 0));
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Rango [start, end) de un día ART (días atrás respecto de hoy: 1 = ayer). */
export function artDayRange(daysAgo: number) {
  const date = addDays(artDateString(), -daysAgo);
  const next = addDays(date, 1);
  return { date, nextDate: next, start: artMidnight(date), end: artMidnight(next) };
}
