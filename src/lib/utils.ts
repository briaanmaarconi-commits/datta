import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const AR_TZ = 'America/Argentina/Buenos_Aires';

/**
 * Returns a YYYY-MM-DD string in Argentina timezone for a given Date or ISO string.
 * If no argument, uses current time.
 */
export function toArgDate(input?: Date | string): string {
  const d = input ? new Date(input) : new Date();
  return d.toLocaleDateString('sv-SE', { timeZone: AR_TZ }); // sv-SE gives YYYY-MM-DD
}

/**
 * Returns ISO strings for the start and end of a given date in Argentina timezone.
 * Useful for querying timestamps stored in UTC.
 */
export function argDayRange(dateStr: string): { from: string; to: string } {
  // dateStr is YYYY-MM-DD in Argentina time
  // Argentina is UTC-3 (no DST)
  const from = new Date(dateStr + 'T00:00:00-03:00').toISOString();
  const to = new Date(dateStr + 'T23:59:59.999-03:00').toISOString();
  return { from, to };
}

/**
 * Returns the current hour in Argentina timezone.
 */
export function argHour(input?: Date | string): number {
  const d = input ? new Date(input) : new Date();
  return parseInt(d.toLocaleString('en-US', { timeZone: AR_TZ, hour: 'numeric', hour12: false }));
}

/**
 * Returns the day of week (0=Sun) in Argentina timezone.
 */
export function argDayOfWeek(input?: Date | string): number {
  const d = input ? new Date(input) : new Date();
  const dayStr = d.toLocaleDateString('en-US', { timeZone: AR_TZ, weekday: 'short' });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[dayStr] ?? 0;
}
