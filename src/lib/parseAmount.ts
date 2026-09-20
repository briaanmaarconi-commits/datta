/**
 * Convierte un monto escrito por el usuario a número.
 * Acepta coma decimal (1350,25), punto decimal (1350.25) y
 * separadores de miles (1.350,25 o 1,350.25).
 */
export function parseAmount(input: string | number | null | undefined): number {
  if (typeof input === 'number') return isFinite(input) ? input : 0;
  if (!input) return 0;

  let s = String(input).trim().replace(/\s/g, '').replace(/\$/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    // El último separador es el decimal, el otro son miles
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Solo comas: decimal si hay 1 o 2 dígitos después, si no son miles
    const decimals = s.length - lastComma - 1;
    s = decimals > 0 && decimals <= 2 && s.indexOf(',') === lastComma
      ? s.replace(',', '.')
      : s.replace(/,/g, '');
  }

  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/** Permite tipear dígitos, coma y punto mientras se escribe. */
export function sanitizeAmountInput(value: string): string {
  return value.replace(/[^\d.,-]/g, '');
}
