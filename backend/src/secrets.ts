import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env.js";

// Cifrado en reposo (AES-256-GCM) de secretos guardados en la base, p. ej. la clave privada AFIP.
// Formato: enc:v1:<iv>:<tag>:<datos> (base64). Valores sin prefijo se tratan como texto plano heredado.
const PREFIX = "enc:v1:";

function key(): Buffer | null {
  const k = env.SECRETS_KEY.trim();
  if (!k) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(k) ? Buffer.from(k, "hex") : Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("SECRETS_KEY debe ser de 32 bytes (hex de 64 caracteres o base64)");
  return buf;
}

export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) {
    if (process.env.NODE_ENV === "production") throw new Error("Falta SECRETS_KEY: no se pueden guardar secretos sin cifrar en producción");
    return plain;
  }
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${PREFIX}${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const k = key();
  if (!k) throw new Error("El secreto está cifrado pero falta SECRETS_KEY");
  const [iv, tag, data] = stored.slice(PREFIX.length).split(":").map((x) => Buffer.from(x, "base64"));
  const d = createDecipheriv("aes-256-gcm", k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
