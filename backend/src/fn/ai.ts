import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { aiErrorMessage, aiEnabled, generateFromDocument } from "../ai.js";
import { env } from "../env.js";
import { runDailyAnalysis } from "../jobs/dailyAnalysis.js";
import { runDailyReports } from "../jobs/dailyReport.js";
import { fail, hasEstablishmentRole, loadRoles, requireSession } from "./common.js";

const SYSTEM_PARSE = `Sos un asistente que lee facturas y remitos de compra de un restaurante argentino.
Devolvés SOLO un JSON válido, sin texto extra, con esta forma:
{
  "supplier": string,            // nombre del proveedor, "" si no se lee
  "invoice_number": string,      // número de comprobante, "" si no se lee
  "invoice_date": string,        // formato YYYY-MM-DD, "" si no se lee
  "total": number,               // total final del comprobante, 0 si no se lee
  "items": [
    { "item_name": string, "quantity": number, "unit": string, "unit_price": number, "line_total": number }
  ]
}
Reglas:
- Los montos son números sin símbolos ni separadores de miles (ej: 12500.5).
- unit debe ser una de: kg, g, Lt, ml, unidad, bulto, docena, caja. Si no se sabe, usar "unidad".
- Si un dato no se entiende, dejalo vacío o en 0. Nunca inventes.`;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** ¿Puede disparar tareas internas? Superadmin logueado, o el secreto interno (cron externo / mantenimiento). */
function internalSecretOk(headerValue: unknown): boolean {
  return !!env.INTERNAL_CRON_SECRET && headerValue === env.INTERNAL_CRON_SECRET;
}

export async function registerAiFunctions(app: FastifyInstance) {
  // Análisis diario: manual desde la UI (x-establishment-id) o global con secreto interno / superadmin.
  app.post("/api/fn/ai-daily-analysis", async (req, reply) => {
    const explicit = req.headers["x-establishment-id"];
    if (typeof explicit === "string" && explicit) {
      const user = requireSession(req, reply);
      if (!user) return;
      if (!(await hasEstablishmentRole(user.id, explicit, ["admin", "cashier"]))) return fail(reply, 403, "Forbidden");
      return { ok: true, results: await runDailyAnalysis(explicit) };
    }
    const user = req.user;
    const isSuper = user ? (await loadRoles(user.id)).some((r) => r.role === "superadmin") : false;
    if (!isSuper && !internalSecretOk(req.headers["x-cron-secret"])) return fail(reply, 403, "Forbidden");
    return { ok: true, results: await runDailyAnalysis() };
  });

  // Reporte diario por mail: mismo esquema de permisos.
  app.post("/api/fn/daily-report-email", async (req, reply) => {
    const body = z.object({ establishment_id: z.string().uuid().optional() }).safeParse(req.body ?? {});
    const est = body.success ? body.data.establishment_id : undefined;
    if (est) {
      const user = requireSession(req, reply);
      if (!user) return;
      if (!(await hasEstablishmentRole(user.id, est, ["admin"]))) return fail(reply, 403, "Forbidden");
      return runDailyReports({ establishmentId: est });
    }
    const user = req.user;
    const isSuper = user ? (await loadRoles(user.id)).some((r) => r.role === "superadmin") : false;
    if (!isSuper && !internalSecretOk(req.headers["x-cron-secret"])) return fail(reply, 403, "Forbidden");
    return runDailyReports();
  });

  // Lectura de facturas de compra con IA (imagen o PDF -> JSON).
  app.post("/api/fn/parse-invoice", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireSession(req, reply)) return;
    if (!aiEnabled()) return fail(reply, 503, "La lectura con IA no está configurada en este servidor.");

    const b = z.object({ fileData: z.string().min(10), mimeType: z.string(), filename: z.string().optional() }).safeParse(req.body);
    if (!b.success) return fail(reply, 400, "Se requiere el archivo (fileData) y su tipo (mimeType)");
    const { fileData, mimeType } = b.data;

    const isPdf = mimeType === "application/pdf";
    if (!isPdf && !IMAGE_TYPES.has(mimeType)) return fail(reply, 415, "Formato no soportado: usá JPG, PNG, WEBP o PDF.");
    const base64 = fileData.startsWith("data:") ? fileData.slice(fileData.indexOf(",") + 1) : fileData;

    try {
      const raw = await generateFromDocument({
        kind: "parse",
        system: SYSTEM_PARSE,
        prompt: "Leé esta factura de compra y devolvé el JSON.",
        mime: mimeType,
        base64,
        maxTokens: 4096,
      });
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return fail(reply, 422, "No se pudo interpretar el comprobante. Cargalo a mano.");
      let parsed: any;
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return fail(reply, 422, "No se pudo interpretar el comprobante. Cargalo a mano.");
      }
      const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      return {
        supplier: String(parsed.supplier ?? ""),
        invoice_number: String(parsed.invoice_number ?? ""),
        invoice_date: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.invoice_date ?? "")) ? String(parsed.invoice_date) : "",
        total: num(parsed.total),
        items: Array.isArray(parsed.items)
          ? parsed.items.slice(0, 60).map((i: any) => ({
              item_name: String(i?.item_name ?? "").slice(0, 200),
              quantity: num(i?.quantity),
              unit: String(i?.unit ?? "unidad").slice(0, 20),
              unit_price: num(i?.unit_price),
              line_total: num(i?.line_total) || num(i?.quantity) * num(i?.unit_price),
            }))
          : [],
      };
    } catch (e) {
      req.log.error({ err: e }, "parse-invoice");
      const { status, message } = aiErrorMessage(e, "No se pudo leer la factura.");
      return fail(reply, status, message);
    }
  });
}
