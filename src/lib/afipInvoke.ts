import { db } from '@/lib/db';

/**
 * Llama a la edge function `afip-invoice` y devuelve SIEMPRE el mensaje real de error.
 *
 * `db.functions.invoke` descarta el body cuando la respuesta no es 2xx y sólo deja
 * "Edge Function returned a non-2xx status code". Acá leemos el body de `error.context`
 * para poder mostrar el rechazo concreto de ARCA (código + descripción).
 */
export async function invokeAfip<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.functions.invoke('afip-invoice', { body });

  if (error) {
    let message = error.message || 'Error al comunicarse con ARCA';
    const res = (error as any)?.context;
    if (res && typeof res.json === 'function') {
      try {
        const payload = await res.clone().json();
        if (payload?.error) {
          message = Array.isArray(payload.observaciones) && payload.observaciones.length
            ? `${payload.error}`
            : payload.error;
        }
      } catch {
        try {
          const text = await res.clone().text();
          if (text) message = text;
        } catch {
          /* sin body legible */
        }
      }
    }
    throw new Error(message);
  }

  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}
