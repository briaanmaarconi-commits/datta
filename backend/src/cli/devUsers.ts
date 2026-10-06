// SOLO DESARROLLO: crea filas en auth.users para los profiles copiados, con una contraseña de prueba.
import bcrypt from "bcryptjs";
import pg from "pg";
import { env } from "../env.js";

const pw = process.argv[2] ?? "DevPass-2026!";
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await c.query("SET session_replication_role = replica"); // evita que handle_new_user duplique el profile
const hash = await bcrypt.hash(pw, 10);
const r = await c.query(
  `INSERT INTO auth.users (id, email, encrypted_password)
   SELECT p.id, p.email, $1 FROM public.profiles p WHERE p.email IS NOT NULL
   ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password`,
  [hash],
);
console.log(`usuarios de desarrollo: ${r.rowCount}`);
const roles = await c.query(
  `SELECT p.email, ur.role, e.name AS establishment
     FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
     LEFT JOIN public.establishments e ON e.id = ur.establishment_id ORDER BY ur.role, e.name`,
);
console.table(roles.rows);
const moji = await c.query(`SELECT count(*)::int n FROM public.products WHERE name ~ 'Ã.'`);
console.log("productos con mojibake:", moji.rows[0].n, "| ejemplo:", (await c.query(`SELECT name FROM public.products WHERE name ~ '[ñóéíá]' LIMIT 2`)).rows.map((x) => x.name).join(" / "));
await c.end();
