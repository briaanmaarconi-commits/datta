import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";

// Capa de IA con dos proveedores intercambiables: Anthropic (Claude) y Google Gemini.
// AI_PROVIDER=auto (por defecto) usa el que tenga clave configurada (Anthropic primero).

export type Provider = "anthropic" | "gemini";
export type Kind = "chat" | "parse" | "analysis";

export function provider(): Provider | null {
  const want = env.AI_PROVIDER;
  if (want === "anthropic") return env.ANTHROPIC_API_KEY.trim() ? "anthropic" : null;
  if (want === "gemini") return env.GEMINI_API_KEY.trim() ? "gemini" : null;
  if (env.ANTHROPIC_API_KEY.trim()) return "anthropic";
  if (env.GEMINI_API_KEY.trim()) return "gemini";
  return null;
}
export const aiEnabled = () => provider() !== null;

export class AiNotConfigured extends Error {
  constructor() {
    super("La IA no está configurada en este servidor (falta ANTHROPIC_API_KEY o GEMINI_API_KEY).");
  }
}
export class AiHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Mensaje amable (en español) para errores de la API de IA. */
export function aiErrorMessage(e: unknown, fallback: string): { status: number; message: string } {
  if (e instanceof AiNotConfigured) return { status: 503, message: e.message };
  const status = (e as { status?: number })?.status;
  if (status === 429) return { status: 429, message: "Demasiadas consultas seguidas (o se agotó la cuota gratuita del día). Esperá un rato y probá de nuevo." };
  if (status === 402 || status === 401 || status === 403) return { status: 503, message: "El servicio de IA no está disponible (revisá la clave o el saldo/cuota de la cuenta)." };
  return { status: 502, message: fallback };
}

const modelFor = (p: Provider, kind: Kind) =>
  p === "gemini" ? env.GEMINI_MODEL : kind === "chat" ? env.AI_MODEL_CHAT : kind === "parse" ? env.AI_MODEL_PARSE : env.AI_MODEL_ANALYSIS;

// ------------------------------------------------------------------ Anthropic
let anthropic: Anthropic | null = null;
const claude = () => (anthropic ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));
const textOfClaude = (msg: Anthropic.Message) =>
  msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();

// ------------------------------------------------------------------ Gemini (REST)
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Gemini acepta un subconjunto de JSON Schema: sin additionalProperties, nullable en vez de ["x","null"], tipos en mayúsculas. */
export function toGeminiSchema(s: any): any {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== "object") return s;
  const out: any = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "additionalProperties" || k === "$schema") continue;
    if (k === "type") {
      if (Array.isArray(v)) {
        const real = v.filter((t) => t !== "null");
        out.type = String(real[0] ?? "string").toUpperCase();
        if (v.includes("null")) out.nullable = true;
      } else out.type = String(v).toUpperCase();
    } else if (k === "properties" && v && typeof v === "object") {
      out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
    } else if (k === "items") out.items = toGeminiSchema(v);
    else out[k] = v;
  }
  // Gemini rechaza objetos sin propiedades en functionDeclarations: se omiten los parámetros vacíos
  return out;
}

async function geminiCall(model: string, body: unknown): Promise<any> {
  const res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new AiHttpError(res.status, `Gemini ${res.status}: ${detail}`);
  }
  return res.json();
}

const geminiText = (resp: any): string =>
  (resp?.candidates?.[0]?.content?.parts ?? []).filter((p: any) => typeof p.text === "string" && !p.thought).map((p: any) => p.text).join("").trim();

// ------------------------------------------------------------------ API neutral
export interface NeutralTool {
  name: string;
  description: string;
  /** JSON Schema (formato Anthropic: type/properties/required) */
  parameters: Record<string, any>;
}

/** Texto -> texto (sugerencia diaria del dashboard). */
export async function generateText(o: { kind: Kind; system: string; prompt: string; maxTokens: number }): Promise<string> {
  const p = provider();
  if (!p) throw new AiNotConfigured();
  const model = modelFor(p, o.kind);
  if (p === "anthropic") {
    const r = await claude().messages.create({ model, max_tokens: o.maxTokens, system: o.system, messages: [{ role: "user", content: o.prompt }] });
    return textOfClaude(r);
  }
  const r = await geminiCall(model, {
    systemInstruction: { parts: [{ text: o.system }] },
    contents: [{ role: "user", parts: [{ text: o.prompt }] }],
    generationConfig: { maxOutputTokens: o.maxTokens },
  });
  return geminiText(r);
}

/** Imagen o PDF + instrucción -> texto (lectura de facturas). */
export async function generateFromDocument(o: { kind: Kind; system: string; prompt: string; mime: string; base64: string; maxTokens: number }): Promise<string> {
  const p = provider();
  if (!p) throw new AiNotConfigured();
  const model = modelFor(p, o.kind);
  if (p === "anthropic") {
    const isPdf = o.mime === "application/pdf";
    const content: any[] = [
      isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: o.base64 } }
        : { type: "image", source: { type: "base64", media_type: o.mime, data: o.base64 } },
      { type: "text", text: o.prompt },
    ];
    const r = await claude().messages.create({ model, max_tokens: o.maxTokens, system: o.system, messages: [{ role: "user", content }] });
    return textOfClaude(r);
  }
  const r = await geminiCall(model, {
    systemInstruction: { parts: [{ text: o.system }] },
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: o.mime, data: o.base64 } }, { text: o.prompt }] }],
    generationConfig: { maxOutputTokens: o.maxTokens, responseMimeType: "application/json" },
  });
  return geminiText(r);
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

/**
 * Conversación con herramientas: el modelo puede pedir ejecutar tools; runTool devuelve el resultado en texto
 * y el ciclo sigue hasta que el modelo responde sin pedir más (máx. maxRounds).
 */
export async function runToolChat(o: {
  system: string;
  messages: ChatMsg[];
  tools: NeutralTool[];
  runTool: (name: string, args: Record<string, any>) => Promise<string>;
  maxRounds: number;
  maxTokens: number;
  onToolCall?: (name: string, out: string) => void;
}): Promise<string> {
  const p = provider();
  if (!p) throw new AiNotConfigured();
  const model = modelFor(p, "chat");
  let lastText = "";

  if (p === "anthropic") {
    const messages: Anthropic.MessageParam[] = o.messages.map((m) => ({ role: m.role, content: m.content }));
    const tools: Anthropic.Tool[] = o.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema }));
    for (let round = 0; round < o.maxRounds; round++) {
      const res = await claude().messages.create({ model, max_tokens: o.maxTokens, system: o.system, tools, messages });
      lastText = textOfClaude(res) || lastText;
      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || !uses.length) return lastText;
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of uses) {
        const out = await o.runTool(tu.name, (tu.input ?? {}) as Record<string, any>);
        o.onToolCall?.(tu.name, out);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
      }
      messages.push({ role: "user", content: results });
    }
    return lastText;
  }

  // Gemini
  const contents: any[] = o.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const functionDeclarations = o.tools.map((t) => {
    const params = toGeminiSchema(t.parameters);
    const hasProps = params.properties && Object.keys(params.properties).length > 0;
    return { name: t.name, description: t.description, ...(hasProps ? { parameters: params } : {}) };
  });
  for (let round = 0; round < o.maxRounds; round++) {
    const res = await geminiCall(model, {
      systemInstruction: { parts: [{ text: o.system }] },
      contents,
      tools: [{ functionDeclarations }],
      generationConfig: { maxOutputTokens: o.maxTokens },
    });
    const content = res?.candidates?.[0]?.content;
    lastText = geminiText(res) || lastText;
    const calls = (content?.parts ?? []).filter((x: any) => x.functionCall);
    if (!calls.length) return lastText;
    // se devuelve el contenido tal cual (incluye thoughtSignature, que Gemini exige al responder a una llamada)
    contents.push({ role: "model", parts: content.parts });
    const responses: any[] = [];
    for (const c of calls) {
      const out = await o.runTool(c.functionCall.name, c.functionCall.args ?? {});
      o.onToolCall?.(c.functionCall.name, out);
      responses.push({ functionResponse: { name: c.functionCall.name, response: { result: out } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return lastText;
}
