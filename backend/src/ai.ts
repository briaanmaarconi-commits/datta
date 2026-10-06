import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";

let client: Anthropic | null = null;

export const aiEnabled = () => !!env.ANTHROPIC_API_KEY.trim();

export function ai(): Anthropic {
  if (!aiEnabled()) throw new AiNotConfigured();
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

export class AiNotConfigured extends Error {
  constructor() {
    super("La IA no está configurada en este servidor (falta ANTHROPIC_API_KEY).");
  }
}

export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Mensaje amable (en español) para errores de la API de IA. */
export function aiErrorMessage(e: unknown, fallback: string): { status: number; message: string } {
  if (e instanceof AiNotConfigured) return { status: 503, message: e.message };
  const status = (e as { status?: number })?.status;
  if (status === 429) return { status: 429, message: "Demasiadas consultas seguidas. Esperá unos segundos y probá de nuevo." };
  if (status === 402 || status === 401 || status === 403) return { status: 503, message: "El servicio de IA no está disponible (revisá la clave o el saldo de la cuenta)." };
  return { status: 502, message: fallback };
}
