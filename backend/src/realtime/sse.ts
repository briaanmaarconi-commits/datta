import type { FastifyInstance } from "fastify";
import pg from "pg";
import { env } from "../env.js";
import type { SessionUser } from "../auth/session.js";

interface ChangeEvent {
  table: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  id: string;
  est: string | null;
  new?: Record<string, unknown>;
}
interface Subscriber {
  user: SessionUser;
  write: (chunk: string) => void;
}

const subscribers = new Set<Subscriber>();

function visibleTo(user: SessionUser, ev: ChangeEvent): boolean {
  if (user.role === "superadmin") return true;
  return !!ev.est && ev.est === user.establishmentId;
}

function broadcast(raw: string) {
  let ev: ChangeEvent;
  try {
    ev = JSON.parse(raw);
  } catch {
    return;
  }
  const line = `data: ${raw}\n\n`;
  for (const s of subscribers) if (visibleTo(s.user, ev)) s.write(line);
}

let listener: pg.Client | null = null;

/** Mantiene una conexión LISTEN con reconexión automática. */
async function startListener(app: FastifyInstance) {
  const connect = async () => {
    const c = new pg.Client({ connectionString: env.APP_DATABASE_URL ?? env.DATABASE_URL });
    c.on("notification", (m) => m.payload && broadcast(m.payload));
    const retry = () => {
      if (listener === c) listener = null;
      setTimeout(() => void connect().catch(() => retry()), 3000);
    };
    c.on("error", (e) => {
      app.log.error({ err: e }, "listener de realtime caído");
      retry();
    });
    c.on("end", retry);
    await c.connect();
    await c.query("LISTEN datta_changes");
    listener = c;
    app.log.info("realtime: escuchando datta_changes");
  };
  await connect().catch((e) => {
    app.log.error({ err: e }, "no se pudo iniciar el listener de realtime");
    setTimeout(() => void startListener(app), 3000);
  });
}

export async function registerRealtime(app: FastifyInstance) {
  await startListener(app);

  app.get("/api/events", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: { message: "No autenticado" } });
    const user = req.user;
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");
    const sub: Subscriber = { user, write: (chunk) => res.write(chunk) };
    subscribers.add(sub);
    const beat = setInterval(() => res.write(": ping\n\n"), 20_000);
    req.raw.on("close", () => {
      clearInterval(beat);
      subscribers.delete(sub);
    });
  });
}
