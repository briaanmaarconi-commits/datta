import type { FastifyInstance } from "fastify";
import { SERVICE, withDb } from "../db/pool.js";
import { LOOKBACK_DAYS, analyzePriceSensitivity } from "../lib/priceSensitivity.js";
import { fail, loadRoles, requireSession } from "./common.js";

/** Sensibilidad al precio de los productos del local (Analíticas → Rentabilidad / Productos). Solo el admin. */
export async function registerPriceSensitivity(app: FastifyInstance) {
  app.post("/api/fn/price-sensitivity", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;
    const admin = (await loadRoles(user.id)).find((r) => r.role === "admin" && r.establishment_id);
    if (!admin?.establishment_id) return fail(reply, 403, "Solo el administrador del local ve este análisis");
    const products = await withDb(SERVICE, (c) => analyzePriceSensitivity(c, admin.establishment_id!));
    return { lookback_days: LOOKBACK_DAYS, products };
  });
}
