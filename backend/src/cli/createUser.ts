// Uso: npx tsx src/cli/createUser.ts <email> <password> <role> [establishmentId] ["Nombre completo"]
// Crea (o actualiza la contraseña de) un usuario y le asigna un rol. Sirve para el primer superadmin.
import bcrypt from "bcryptjs";
import pg from "pg";
import { env } from "../env.js";

const [email, password, role, establishmentId, fullName] = process.argv.slice(2);
if (!email || !password || !role) {
  console.error('Uso: createUser <email> <password> <role> [establishmentId] ["Nombre"]');
  process.exit(1);
}
if (!["superadmin", "admin", "cashier", "waiter", "kitchen"].includes(role)) throw new Error("rol inválido");

const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
const hash = await bcrypt.hash(password, 10);
const { rows } = await c.query(
  `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data)
   VALUES (lower($1), $2, $3::jsonb)
   ON CONFLICT (email) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password, updated_at = now()
   RETURNING id`,
  [email, hash, JSON.stringify({ full_name: fullName ?? email })],
);
const id = rows[0].id;
await c.query(`INSERT INTO public.profiles (id, email, full_name) VALUES ($1, lower($2), $3) ON CONFLICT (id) DO NOTHING`, [id, email, fullName ?? email]);
await c.query(
  `INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
  [id, role, role === "superadmin" ? null : establishmentId ?? null],
);
console.log(`usuario listo: ${email} (${role}) id=${id}`);
await c.end();
