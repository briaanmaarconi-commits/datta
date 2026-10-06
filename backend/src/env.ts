import "dotenv/config";
import { z } from "zod";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z.object({
  PORT: z.coerce.number().default(8081),
  // Rol dueño del esquema: solo lo usa `npm run migrate` y los scripts de datos.
  DATABASE_URL: z.string().min(1),
  // Rol de la app (datta_app): sin privilegios directos, cambia a anon/authenticated/service_role por request.
  APP_DATABASE_URL: z.string().optional(),
  APP_DB_PASSWORD: z.string().optional(),

  COOKIE_SECURE: bool.default("true"),
  SESSION_TTL_DAYS: z.coerce.number().default(30),
  LOGIN_RATE_LIMIT: z.coerce.number().default(10),
  PUBLIC_ORIGIN: z.string().url().default("http://localhost:8080"),
  STORAGE_DIR: z.string().default("./uploads"),

  // Clave (32 bytes en hex o base64) para cifrar la clave privada AFIP en reposo.
  SECRETS_KEY: z.string().default(""),
  INTERNAL_CRON_SECRET: z.string().default(""),

  AI_PROVIDER: z.enum(["auto", "anthropic", "gemini"]).default("auto"),
  ANTHROPIC_API_KEY: z.string().default(""),
  GEMINI_API_KEY: z.string().default(""),
  // Modelos Gemini en orden de preferencia, separados por coma. La capa gratuita da una cuota diaria chica POR MODELO
  // (p. ej. 20 pedidos/día), así que si uno se agota o no está disponible se pasa automáticamente al siguiente.
  GEMINI_MODEL: z.string().default("gemini-3.5-flash,gemini-3.1-flash-lite,gemini-3.6-flash,gemini-3-flash-preview,gemini-flash-latest,gemini-flash-lite-latest"),
  AI_MODEL_CHAT: z.string().default("claude-sonnet-5-5"),
  AI_MODEL_PARSE: z.string().default("claude-sonnet-5-5"),
  AI_MODEL_ANALYSIS: z.string().default("claude-haiku-4-5-20251001"),
  // Cobro de suscripciones (Mercado Pago). El secreto firma los webhooks (opcional pero recomendado).
  MERCADOPAGO_ACCESS_TOKEN: z.string().default(""),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().default(""),
  RESEND_API_KEY: z.string().default(""),
  REPORT_FROM_EMAIL: z.string().default("Datta <onboarding@resend.dev>"),
  CRON_ENABLED: bool.default("true"),
});

export const env = schema.parse(process.env);
