import { db } from '@/lib/db';

/** POST a /api/fn/<path>; devuelve el JSON o lanza Error con el mensaje del servidor. */
export async function callFn<T = any>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.functions.invoke(path, { body });
  if (error) throw new Error(error.message);
  return data as T;
}
