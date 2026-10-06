import cron from "node-cron";
import type { FastifyInstance } from "fastify";
import { env } from "./env.js";
import { runDailyAnalysis } from "./jobs/dailyAnalysis.js";
import { runDailyReports } from "./jobs/dailyReport.js";
import { artHour } from "./lib/time.js";

/**
 * Tareas programadas (reemplazan los 2 pg_cron de producción: análisis 04:00 ART y reporte por mail).
 * Corre dentro del proceso de la API; con varias réplicas habría que moverlo a un worker o usar un lock.
 */
export function startCron(app: FastifyInstance) {
  if (!env.CRON_ENABLED) {
    app.log.info("cron deshabilitado (CRON_ENABLED=false)");
    return;
  }
  const tz = "America/Argentina/Buenos_Aires";

  cron.schedule("0 4 * * *", () => {
    runDailyAnalysis().then((r) => app.log.info({ r }, "análisis diario terminado")).catch((e) => app.log.error({ err: e }, "análisis diario falló"));
  }, { timezone: tz });

  // Cada hora en punto: envía el reporte a los establecimientos que lo configuraron para esa hora.
  cron.schedule("0 * * * *", () => {
    runDailyReports({ hour: artHour() }).then((r) => app.log.info({ r }, "reportes diarios terminados")).catch((e) => app.log.error({ err: e }, "reportes diarios fallaron"));
  }, { timezone: tz });

  app.log.info("cron iniciado: análisis 04:00 ART, reportes cada hora según la hora configurada");
}
