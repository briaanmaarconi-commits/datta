import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Sirve el frontend compilado (Vite) desde el mismo proceso: un solo contenedor y un solo dominio,
 * así las cookies de sesión son del mismo origen y no hace falta un proxy aparte.
 * Rutas que no son /api ni /files caen en index.html (SPA).
 */
export async function registerWeb(app: FastifyInstance) {
  const dist = resolve(process.env.WEB_DIST ?? "./web");
  if (!existsSync(resolve(dist, "index.html"))) {
    app.log.warn(`frontend no encontrado en ${dist}: solo se sirve la API`);
    return;
  }

  await app.register(fastifyStatic, {
    root: dist,
    wildcard: false,
    index: false,
    setHeaders: (res, path) => {
      // assets con hash en el nombre: cache largo; el resto (index.html, etc.): siempre revalidar
      if (/[\\/]assets[\\/]/.test(path)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      else res.setHeader("Cache-Control", "no-cache");
    },
  });

  app.get("/*", async (req, reply) => {
    const url = req.raw.url ?? "";
    if (url.startsWith("/api/") || url.startsWith("/files/") || url.startsWith("/functions/")) {
      return reply.code(404).send({ error: "No encontrado" });
    }
    // archivos estáticos existentes (favicon, imágenes de /public, etc.)
    const rel = decodeURIComponent(url.split("?")[0]).replace(/^\/+/, "");
    if (rel && !rel.includes("..") && existsSync(resolve(dist, rel)) && rel.includes(".")) return reply.sendFile(rel);
    return reply.header("Cache-Control", "no-cache").sendFile("index.html");
  });
}
