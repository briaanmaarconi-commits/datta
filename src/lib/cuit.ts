/** Utilidades de CUIT/CUIL (11 dígitos con dígito verificador). */

export const cuitDigits = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');

/** true si son 11 dígitos y el dígito verificador es correcto. */
export function isValidCuit(v: string | null | undefined): boolean {
  const d = cuitDigits(v);
  if (!/^\d{11}$/.test(d)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) return false;
  return check === Number(d[10]);
}

/**
 * Revisa los datos del cliente a facturar.
 * - required (Factura A): CUIT y razón social obligatorios.
 * - opcional (Factura B/C): vacío = Consumidor Final; si se carga algo, tienen que estar los dos y el CUIT ser válido.
 * Devuelve el mensaje de error, o null si está todo bien.
 */
export function receptorError(cuit: string, razonSocial: string, required: boolean): string | null {
  const d = cuitDigits(cuit);
  const razon = razonSocial.trim();
  if (!d && !razon) return required ? 'Cargá el CUIT y la razón social del cliente' : null;
  if (!d) return 'Falta el CUIT del cliente';
  if (!isValidCuit(d)) return 'El CUIT del cliente no es válido (revisá los 11 números)';
  if (!razon) return 'Falta la razón social del cliente';
  return null;
}
