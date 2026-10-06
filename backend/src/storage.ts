import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { env } from "./env.js";
import { loadRoles } from "./fn/common.js";

// Reemplazo de Supabase Storage: archivos en disco (volumen persistente) bajo STORAGE_DIR/<bucket>/<ruta>.
// product-images es público (se sirve en /files/product-images/...); purchase-receipts es privado y por establecimiento.
const BUCKETS = {
  "product-images": { public: true, exts: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"], estSegment: 1 }, // <prefijo>/<estId>/<archivo>
  "purchase-receipts": { public: false, exts: [".jpg", ".jpeg", ".png", ".webp", ".pdf", ".heic"], estSegment: 0 }, // <estId>/<archivo>
} as const;
type Bucket = keyof typeof BUCKETS;

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".gif": "image/gif", ".avif": "image/avif", ".pdf": "application/pdf", ".heic": "image/heic",
};

const root = () => resolve(env.STORAGE_DIR);

/** Ruta absoluta segura dentro del bucket (sin escapar de STORAGE_DIR). */
function safePath(bucket: string, rel: string): string | null {
  if (!rel || rel.includes("\0") || rel.includes("\\")) return null;
  const parts = rel.split("/");
  if (parts.some((p) => !p || p === "." || p === "..")) return null;
  const base = join(root(), bucket);
  const full = resolve(base, rel);
  return full.startsWith(base + sep) ? full : null;
}

async function canAccess(userId: string, bucket: Bucket, rel: string): Promise<boolean> {
  const est = rel.split("/")[BUCKETS[bucket].estSegment];
  const roles = await loadRoles(userId);
  if (roles.some((r) => r.role === "superadmin")) return true;
  return !!est && roles.some((r) => r.establishment_id === est);
}

export async function registerStorage(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 5 } });

  app.post("/api/storage/:bucket", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: { message: "No autenticado" } });
    const bucket = (req.params as { bucket: string }).bucket as Bucket;
    if (!(bucket in BUCKETS)) return reply.code(404).send({ error: { message: "Bucket inexistente" } });

    const file = await req.file();
    const rel = String((file?.fields.path as { value?: string } | undefined)?.value ?? "");
    if (!file || !rel) return reply.code(400).send({ error: { message: "Falta el archivo o la ruta" } });

    const ext = extname(rel).toLowerCase();
    if (!BUCKETS[bucket].exts.includes(ext as never)) return reply.code(415).send({ error: { message: "Tipo de archivo no permitido" } });
    const full = safePath(bucket, rel);
    if (!full) return reply.code(400).send({ error: { message: "Ruta inválida" } });
    if (!(await canAccess(req.user.id, bucket, rel))) return reply.code(403).send({ error: { message: "Sin permiso sobre ese establecimiento" } });

    const buf = await file.toBuffer(); // lanza si supera el límite
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, buf);
    return { path: rel };
  });

  app.get("/files/:bucket/*", async (req, reply) => {
    const { bucket, "*": rel } = req.params as { bucket: string; "*": string };
    if (!(bucket in BUCKETS)) return reply.code(404).send({ error: "No encontrado" });
    const b = bucket as Bucket;
    if (!BUCKETS[b].public) {
      if (!req.user) return reply.code(401).send({ error: "No autenticado" });
      if (!(await canAccess(req.user.id, b, rel))) return reply.code(403).send({ error: "Sin permiso" });
    }
    const full = safePath(b, rel);
    const ext = extname(rel).toLowerCase();
    if (!full || !MIME[ext]) return reply.code(404).send({ error: "No encontrado" });
    try {
      await stat(full);
    } catch {
      return reply.code(404).send({ error: "No encontrado" });
    }
    reply
      .header("Content-Type", MIME[ext])
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", BUCKETS[b].public ? "public, max-age=2592000, immutable" : "private, max-age=300");
    return reply.send(createReadStream(full));
  });
}
