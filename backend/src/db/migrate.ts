import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { env } from "../env.js";

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "sql");

// Un archivo puede contener varios bloques separados por "-- @@MIGRATION <nombre>";
// cada bloque se ejecuta y registra por separado (como las migraciones originales).
function blocks(file: string): { name: string; sql: string }[] {
  const text = readFileSync(join(sqlDir, file), "utf8");
  const parts = text.split(/^-- @@MIGRATION (.+)$/m);
  if (parts.length === 1) return [{ name: file, sql: text }];
  const out: { name: string; sql: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) out.push({ name: `${file}:${parts[i].trim()}`, sql: parts[i + 1] });
  return out;
}

const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();
await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
const applied = new Set((await client.query("SELECT name FROM public.schema_migrations")).rows.map((r) => r.name));

let ran = 0;
for (const file of readdirSync(sqlDir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()) {
  for (const b of blocks(file)) {
    if (applied.has(b.name)) continue;
    try {
      await client.query("BEGIN");
      await client.query(b.sql);
      await client.query("INSERT INTO public.schema_migrations(name) VALUES ($1)", [b.name]);
      await client.query("COMMIT");
      ran++;
    } catch (e) {
      await client.query("ROLLBACK");
      console.error(`FALLÓ ${b.name}:`, (e as Error).message);
      process.exit(1);
    }
  }
}
console.log(`migraciones aplicadas: ${ran}`);

if (env.APP_DB_PASSWORD) {
  const pw = env.APP_DB_PASSWORD.replace(/'/g, "''");
  await client.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='datta_app') THEN
      CREATE ROLE datta_app LOGIN NOINHERIT PASSWORD '${pw}';
    ELSE
      ALTER ROLE datta_app LOGIN NOINHERIT PASSWORD '${pw}';
    END IF; END $$;`);
  await client.query(`GRANT anon, authenticated, service_role TO datta_app`);
  console.log("rol datta_app listo");
}
await client.end();
