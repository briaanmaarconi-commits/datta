// Impresión de comandas desde la PC de caja (local con una sola PC).
// Es opt-in y por PC: solo imprime el navegador donde alguien lo prendió (una caja abierta desde otra compu, por
// ejemplo a distancia, no se lleva las comandas). El local recuerda que imprime así (establishments.cashier_comandas)
// para avisar en una caja que no lo tiene prendido, por ejemplo si se borraron los datos del navegador.
const key = (establishmentId: string | null | undefined) => `datta.cashierComandas.${establishmentId ?? 'none'}`;

export const COMANDA_PRINT_EVENT = 'datta-comanda-print-changed';
export const COMANDA_TEST_EVENT = 'datta-comanda-print-test';
/** Lo emite la PC de caja después de imprimir una comanda: detail = true si apareció el cuadro de "Imprimir". */
export const COMANDA_PRINTED_EVENT = 'datta-comanda-printed';
/** Ruta de la guía para prender las comandas en la caja. */
export const COMANDA_GUIDE_PATH = '/cashier/impresoras?guia=comandas';

/** Lo que eligió esta PC: true/false, o null si este navegador nunca lo configuró. */
export function readCashierComandaLocal(establishmentId: string | null | undefined): boolean | null {
  try {
    const v = localStorage.getItem(key(establishmentId));
    return v === 'true' ? true : v === 'false' ? false : null;
  } catch {
    return null;
  }
}

export function setCashierComandaLocal(establishmentId: string | null | undefined, on: boolean) {
  try {
    localStorage.setItem(key(establishmentId), String(on));
  } catch {
    /* navegador sin almacenamiento: queda apagado */
  }
  window.dispatchEvent(new Event(COMANDA_PRINT_EVENT));
}
