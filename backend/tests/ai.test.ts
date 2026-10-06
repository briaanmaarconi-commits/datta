import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.AI_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = "test-key";
process.env.ANTHROPIC_API_KEY = "";
process.env.GEMINI_MODEL = "gemini-test";

const ai = await import("../src/ai.js");

type Call = { url: string; body: any; headers: Record<string, string> };
let calls: Call[] = [];
function mockGemini(replies: any[]) {
  calls = [];
  vi.stubGlobal("fetch", async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const r = replies.shift();
    if (r instanceof Error) throw r;
    if (r?.__status) return new Response(r.text ?? "error", { status: r.__status });
    return new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } });
  });
}
afterEach(() => vi.unstubAllGlobals());

describe("proveedor", () => {
  beforeAll(() => expect(ai.provider()).toBe("gemini"));
  it("con clave de Gemini la IA queda habilitada", () => expect(ai.aiEnabled()).toBe(true));
});

describe("toGeminiSchema", () => {
  it("quita additionalProperties, pasa tipos a mayúsculas y convierte [x,null] en nullable", () => {
    const out = ai.toGeminiSchema({
      type: "object",
      additionalProperties: false,
      properties: {
        price: { type: "number", description: "p" },
        promo: { type: ["number", "null"], description: "n" },
        ids: { type: "array", items: { type: "string" } },
        kind: { type: "string", enum: ["a", "b"] },
      },
      required: ["price"],
    });
    expect(out).toEqual({
      type: "OBJECT",
      properties: {
        price: { type: "NUMBER", description: "p" },
        promo: { type: "NUMBER", nullable: true, description: "n" },
        ids: { type: "ARRAY", items: { type: "STRING" } },
        kind: { type: "STRING", enum: ["a", "b"] },
      },
      required: ["price"],
    });
  });
});

describe("generateText / generateFromDocument (Gemini)", () => {
  it("manda la clave por header y devuelve el texto", async () => {
    mockGemini([{ candidates: [{ content: { parts: [{ text: " Hola " }] } }] }]);
    const t = await ai.generateText({ kind: "analysis", system: "sys", prompt: "p", maxTokens: 50 });
    expect(t).toBe("Hola");
    expect(calls[0].url).toContain("/models/gemini-test:generateContent");
    expect(calls[0].headers["x-goog-api-key"]).toBe("test-key");
    expect(calls[0].body.systemInstruction.parts[0].text).toBe("sys");
  });
  it("envía imagen/PDF como inlineData y pide JSON", async () => {
    mockGemini([{ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }]);
    const t = await ai.generateFromDocument({ kind: "parse", system: "s", prompt: "leé", mime: "application/pdf", base64: "QUJD", maxTokens: 100 });
    expect(t).toBe('{"a":1}');
    expect(calls[0].body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: "application/pdf", data: "QUJD" } });
    expect(calls[0].body.generationConfig.responseMimeType).toBe("application/json");
  });
  it("429 se traduce a un mensaje de cuota", async () => {
    mockGemini([{ __status: 429, text: "Quota exceeded: GenerateRequestsPerDay" }]);
    const e = await ai.generateText({ kind: "analysis", system: "s", prompt: "p", maxTokens: 10 }).catch((x) => x);
    const m = ai.aiErrorMessage(e, "fallback");
    expect(m.status).toBe(429);
    expect(m.message).toMatch(/cuota|consultas/);
  });
});

describe("runToolChat (Gemini)", () => {
  const tools: any[] = [
    { name: "update_price", description: "d", parameters: { type: "object", properties: { id: { type: "string" }, price: { type: ["number", "null"] } }, required: ["id"], additionalProperties: false } },
    { name: "list_cats", description: "d", parameters: { type: "object", properties: {} } },
  ];
  it("ejecuta la herramienta pedida, devuelve el resultado al modelo y termina con su respuesta", async () => {
    const modelCall = { role: "model", parts: [{ functionCall: { name: "update_price", args: { id: "p1", price: 10 } }, thoughtSignature: "SIG" }] };
    mockGemini([
      { candidates: [{ content: modelCall }] },
      { candidates: [{ content: { role: "model", parts: [{ text: "Listo, precio actualizado." }] } }] },
    ]);
    const ran: any[] = [];
    const out = await ai.runToolChat({
      system: "sys",
      messages: [{ role: "user", content: "subí el precio" }],
      tools,
      maxRounds: 3,
      maxTokens: 100,
      runTool: async (name, args) => { ran.push([name, args]); return "OK 1 fila"; },
    });
    expect(out).toBe("Listo, precio actualizado.");
    expect(ran).toEqual([["update_price", { id: "p1", price: 10 }]]);
    // 1ª llamada: herramientas convertidas; "list_cats" sin parámetros no lleva schema vacío
    const decl = calls[0].body.tools[0].functionDeclarations;
    expect(decl[0].parameters.properties.price).toEqual({ type: "NUMBER", nullable: true });
    expect(decl[1].parameters).toBeUndefined();
    // 2ª llamada: se reenvía el turno del modelo (con thoughtSignature) y la respuesta de la herramienta
    const sent = calls[1].body.contents;
    expect(sent[1]).toEqual({ role: "model", parts: modelCall.parts });
    expect(sent[2]).toEqual({ role: "user", parts: [{ functionResponse: { name: "update_price", response: { result: "OK 1 fila" } } }] });
  });
  it("corta después de maxRounds si el modelo no deja de pedir herramientas", async () => {
    const loop = { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "list_cats", args: {} } }] } }] };
    mockGemini([loop, loop, loop, loop]);
    let n = 0;
    await ai.runToolChat({ system: "s", messages: [{ role: "user", content: "x" }], tools, maxRounds: 2, maxTokens: 10, runTool: async () => (++n, "r") });
    expect(n).toBe(2);
  });
});

describe("reintentos", () => {
  it("ante un 503 transitorio reintenta y termina bien", async () => {
    vi.useFakeTimers();
    mockGemini([{ __status: 503, text: "high demand" }, { candidates: [{ content: { parts: [{ text: "ok" }] } }] }]);
    const p = ai.generateText({ kind: "analysis", system: "s", prompt: "p", maxTokens: 10 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await p).toBe("ok");
    expect(calls).toHaveLength(2);
    vi.useRealTimers();
  });
});
