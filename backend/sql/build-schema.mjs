// Genera sql/010_schema.sql a partir de supabase/migrations (una sola vez; el
// resultado se versiona). Las migraciones se concatenan en orden con un marcador
// por archivo para que el runner las ejecute una a una, y se agrega la limpieza
// de los stubs de Supabase al final.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "supabase", "migrations");
// Migraciones que solo tocan datos de producción con UUID fijos (no son esquema).
const SKIP = ["20260415021718", "20260806124001", "20260806124237", "20260818232051"];
const files = readdirSync(src)
  .filter((f) => f.endsWith(".sql") && !SKIP.some((p) => f.startsWith(p)))
  .sort();

let out = "-- GENERADO por build-schema.mjs desde supabase/migrations. No editar a mano:\n" +
  "-- los cambios nuevos van en archivos sql/1xx_*.sql.\n";
for (const f of files) {
  out += `\n-- @@MIGRATION ${f}\n` + readFileSync(join(src, f), "utf8").trim() + "\n";
}
out += `
-- @@MIGRATION cleanup-supabase-stubs
DROP PUBLICATION IF EXISTS supabase_realtime;
DROP SCHEMA IF EXISTS storage CASCADE;
`;
writeFileSync(join(here, "010_schema.sql"), out);
console.log(`010_schema.sql generado con ${files.length} migraciones`);
