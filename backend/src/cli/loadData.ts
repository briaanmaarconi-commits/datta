// Uso: npx tsx src/cli/loadData.ts <carpeta-con-json> [--truncate]
// Carga datos copiados de producción. Cada archivo es la respuesta JSON de una consulta
//   select json_build_object('t', '<tabla>', 'rows', json_agg(t)) as j from ...
// o  select json_build_object('t','multi','tables', json_build_object('<tabla>', (select json_agg(x) from <tabla> x), ...)) as j
// Se lee todo como UTF-8 y se inserta con jsonb_populate_recordset (sin pasar por la consola ni SQL en texto),
// con session_replication_role = replica: no dispara triggers (costos, NOTIFY, auditoría) ni valida FKs en el orden de carga.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { env } from "../env.js";

const dir = process.argv[2];
const truncate = process.argv.includes("--truncate");
if (!dir) {
  console.error("Uso: loadData <carpeta> [--truncate]");
  process.exit(1);
}

const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();

const known = new Set(
  (await c.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).rows.map((r) => r.tablename as string),
);
const SKIP = new Set(["schema_migrations", "sessions"]);

await c.query("BEGIN");
await c.query("SET LOCAL session_replication_role = replica");

if (truncate) {
  const list = [...known].filter((t) => !SKIP.has(t)).map((t) => `public."${t}"`).join(", ");
  await c.query(`TRUNCATE ${list} CASCADE`);
  console.log("tablas vaciadas");
}

const totals = new Map<string, number>();
async function load(table: string, rows: unknown[]) {
  if (!known.has(table) || SKIP.has(table)) throw new Error(`tabla no permitida: ${table}`);
  if (!rows.length) return;
  await c.query(
    `INSERT INTO public."${table}" SELECT * FROM jsonb_populate_recordset(NULL::public."${table}", $1::jsonb)`,
    [JSON.stringify(rows)],
  );
  totals.set(table, (totals.get(table) ?? 0) + rows.length);
}

for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const parsed = JSON.parse(readFileSync(join(dir, f), "utf8")); // utf8 explícito
  const j = parsed.rows?.[0]?.j ?? parsed.j ?? parsed;
  if (j.t === "multi") {
    for (const [table, rows] of Object.entries<unknown[]>(j.tables)) await load(table, rows ?? []);
  } else {
    await load(j.t, j.rows ?? []);
  }
  console.log("cargado", f);
}

await c.query("COMMIT");
for (const [t, n] of [...totals].sort()) console.log(`${t.padEnd(32)} ${n}`);
await c.end();
