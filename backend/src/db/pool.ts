import pg from "pg";
import { env } from "../env.js";

// types.setTypeParser: devolvemos int8/numeric como los entrega to_jsonb (ya vienen en JSON),
// así que no hace falta tocar parsers: las consultas del motor devuelven jsonb.
export const pool = new pg.Pool({
  connectionString: env.APP_DATABASE_URL ?? env.DATABASE_URL,
  max: 20,
});

export type DbRole = "authenticated" | "service_role";

export interface DbContext {
  role: DbRole;
  /** auth.uid() para las policies; null en tareas internas (service_role). */
  userId: string | null;
}

export const SERVICE: DbContext = { role: "service_role", userId: null };

/**
 * Ejecuta fn dentro de una transacción con el rol y los claims fijados, de modo que
 * Postgres aplique RLS exactamente como lo haría con el JWT de Supabase.
 */
export async function withDb<T>(ctx: DbContext, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // ctx.role sale de un tipo cerrado, nunca de texto del cliente.
    await client.query(`SET LOCAL ROLE ${ctx.role}`);
    const claims = JSON.stringify({ sub: ctx.userId ?? undefined, role: ctx.role });
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [claims]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* conexión ya cerrada */
    }
    throw e;
  } finally {
    client.release();
  }
}
