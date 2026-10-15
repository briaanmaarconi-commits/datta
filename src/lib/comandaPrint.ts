// Impresión de comandas desde la PC de caja (local con una sola PC): se activa por navegador y por local.
// Es opt-in: un local con cocina propia no cambia nada hasta que alguien lo enciende en Impresoras.
const key = (establishmentId: string | null | undefined) => `datta.cashierComandas.${establishmentId ?? 'none'}`;

export const COMANDA_PRINT_EVENT = 'datta-comanda-print-changed';
export const COMANDA_TEST_EVENT = 'datta-comanda-print-test';

export function isCashierComandaPrintOn(establishmentId: string | null | undefined): boolean {
  try {
    return localStorage.getItem(key(establishmentId)) === 'true';
  } catch {
    return false;
  }
}

export function setCashierComandaPrint(establishmentId: string | null | undefined, on: boolean) {
  try {
    localStorage.setItem(key(establishmentId), String(on));
  } catch {
    /* navegador sin almacenamiento: queda apagado */
  }
  window.dispatchEvent(new Event(COMANDA_PRINT_EVENT));
}
