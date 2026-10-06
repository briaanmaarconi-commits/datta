import { supabase } from '@/integrations/supabase/client';

/**
 * Llama a la edge function `afip-invoice` y devuelve SIEMPRE el mensaje real de error.
 *
 * `supabase.functions.invoke` descarta el body cuando la respuesta no es 2xx y sólo deja
 * "Edge Function returned a non-2xx status code". Acá leemos el body de `error.context`
 * para poder mostrar el rechazo concreto de ARCA (código + descripción).
 *
 * Además garantiza que se envíe un token de sesión válido: si el access token está vencido
 * (o a punto de vencer) se refresca antes de llamar, así la función no responde 401.
 */
async function getFreshAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;

  const expiresAt = (session.expires_at ?? 0) * 1000;
  const aboutToExpire = expiresAt - Date.now() < 60_000; // menos de 1 minuto de vida
  if (!aboutToExpire) return session.access_token;

  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed.session?.access_token ?? session.access_token;
}

export async function invokeAfip<T = any>(body: Record<string, unknown>): Promise<T> {
  const token = await getFreshAccessToken();
  if (!token) {
    throw new Error('Tu sesión expiró. Cerrá sesión y volvé a entrar para poder facturar.');
  }

  const { data, error } = await supabase.functions.invoke('afip-invoice', {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

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
    if (res?.status === 401) {
      message = 'Tu sesión expiró. Cerrá sesión y volvé a entrar para poder facturar.';
    }
    throw new Error(message);
  }

  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}
