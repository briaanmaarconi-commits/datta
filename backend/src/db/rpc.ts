import type { SessionUser } from "../auth/session.js";
import { loadCatalog } from "./catalog.js";
import { toQueryError, type QueryResult } from "./queryEngine.js";
import { withDb, type DbRole } from "./pool.js";

interface RpcDef {
  /** Rol de Postgres con el que corre la función. */
  runAs: DbRole;
  /** Argumento que identifica el establecimiento: debe ser el del usuario (o superadmin). */
  estArg?: string;
}

// Lista cerrada de funciones que el front puede invocar.
// Las que usan auth.uid() internamente (y chequean permisos adentro) corren como "authenticated".
// Las que no validan nada en SQL corren como service_role, con la validación hecha acá.
const RPCS: Record<string, RpcDef> = {
  ensure_consumption_expense_category: { runAs: "service_role", estArg: "_establishment_id" },
  ensure_tips_income_category: { runAs: "service_role", estArg: "_establishment_id" },
  ensure_tips_payout_category: { runAs: "service_role", estArg: "_establishment_id" },
  seed_default_finance_categories: { runAs: "service_role", estArg: "_establishment_id" },
  ensure_insight_preferences: { runAs: "service_role", estArg: "_establishment_id" },
  get_business_health: { runAs: "service_role", estArg: "_establishment_id" },
  apply_sale_stock: { runAs: "authenticated" },
  apply_purchase_stock: { runAs: "authenticated" },
  get_afip_cert_status: { runAs: "authenticated" },
  get_delivery_integration_status: { runAs: "authenticated" },
};

const ARG_NAME = /^[a-z_][a-z0-9_]*$/;

const fail = (message: string, code: string): QueryResult => ({
  data: null,
  error: { message, code, details: null, hint: null },
  count: null,
});

export async function runRpc(user: SessionUser, fn: string, args: Record<string, unknown> = {}): Promise<QueryResult> {
  const def = RPCS[fn];
  if (!def) return fail(`Función no permitida: ${fn}`, "42883");
  const cat = await loadCatalog();
  const meta = cat.functions.get(fn);
  if (!meta) return fail(`Función inexistente: ${fn}`, "42883");

  const names = Object.keys(args);
  if (names.some((n) => !ARG_NAME.test(n))) return fail("Nombre de argumento inválido", "PGRST202");

  if (def.estArg) {
    const est = args[def.estArg];
    if (typeof est !== "string") return fail("Falta el establecimiento", "PGRST202");
    if (user.role !== "superadmin" && est !== user.establishmentId) {
      return fail("Sin permiso sobre ese establecimiento", "42501");
    }
  }

  const params: unknown[] = [];
  const call = names
    .map((n) => {
      const v = args[n];
      // objetos/arrays viajan como JSON: el tipo del parámetro lo infiere Postgres de la firma.
      params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v);
      return `${n} => $${params.length}`;
    })
    .join(", ");

  try {
    return await withDb({ role: def.runAs, userId: user.id }, async (c) => {
      switch (meta.kind) {
        case "void":
          await c.query(`SELECT ${fn}(${call})`, params);
          return { data: null, error: null, count: null };
        case "scalar": {
          const r = await c.query(`SELECT ${fn}(${call}) AS r`, params);
          return { data: r.rows[0]?.r ?? null, error: null, count: null };
        }
        case "composite": {
          const r = await c.query(`SELECT to_jsonb(f) AS r FROM ${fn}(${call}) AS f`, params);
          return { data: r.rows[0]?.r ?? null, error: null, count: null };
        }
        default: {
          const r = await c.query(`SELECT to_jsonb(f) AS r FROM ${fn}(${call}) AS f`, params);
          return { data: r.rows.map((x) => x.r), error: null, count: null };
        }
      }
    });
  } catch (e) {
    return { data: null, error: toQueryError(e), count: null };
  }
}
