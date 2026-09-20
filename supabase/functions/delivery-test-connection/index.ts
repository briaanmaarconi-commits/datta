import { corsHeaders, json, requireEstablishmentAdmin, PLATFORMS, type Platform } from "../_shared/deliveryAuth.ts";

const RAPPI_AUTH: Record<string, string> = {
  sandbox: "https://auth.rappi.com/oauth/token",
  production: "https://auth.rappi.com/oauth/token",
};

const PEYA_AUTH: Record<string, string> = {
  sandbox: "https://sandbox-integration-middleware.pedidosya.com/v1/login",
  production: "https://integration-middleware.pedidosya.com/v1/login",
};

async function testRappi(creds: Record<string, string>, clientId: string | null, env: string) {
  if (!clientId || !creds.client_secret) return { ok: false, message: "Falta Client ID o Client Secret" };
  const res = await fetch(RAPPI_AUTH[env], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audience: "https://int-public-api-v2.rappi.com",
      client_id: clientId,
      client_secret: creds.client_secret,
      grant_type: "client_credentials",
    }),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, message: `Rappi respondió ${res.status}: ${text.slice(0, 300)}` };
  return { ok: true, message: "Autenticación con Rappi correcta" };
}

async function testPeya(creds: Record<string, string>, vendorId: string | null, env: string) {
  if (!creds.api_key) return { ok: false, message: "Falta API Key / Client Secret de PedidosYa" };
  if (!vendorId) return { ok: false, message: "Falta el Vendor ID de PedidosYa" };
  const res = await fetch(PEYA_AUTH[env], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: vendorId, password: creds.api_key }),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, message: `PedidosYa respondió ${res.status}: ${text.slice(0, 300)}` };
  return { ok: true, message: "Autenticación con PedidosYa correcta" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const establishmentId = body.establishment_id as string | undefined;
    const platform = body.platform as Platform | undefined;

    if (!establishmentId) return json({ error: "establishment_id requerido" }, 400);
    if (!platform || !PLATFORMS.includes(platform)) return json({ error: "platform inválida" }, 400);

    const auth = await requireEstablishmentAdmin(req, establishmentId);
    if ("error" in auth) return auth.error;
    const admin = auth.admin!;

    const { data: row } = await admin
      .from("delivery_integrations")
      .select("id, environment, client_id, external_vendor_id, credentials")
      .eq("establishment_id", establishmentId)
      .eq("platform", platform)
      .maybeSingle();

    if (!row) return json({ ok: false, message: "No hay credenciales cargadas todavía" }, 200);

    const creds = (row.credentials ?? {}) as Record<string, string>;
    let result: { ok: boolean; message: string };
    try {
      result = platform === "rappi"
        ? await testRappi(creds, row.client_id, row.environment)
        : await testPeya(creds, row.external_vendor_id, row.environment);
    } catch (e) {
      result = { ok: false, message: `No se pudo contactar la plataforma: ${(e as Error).message}` };
    }

    await admin.from("delivery_integrations").update({
      status: result.ok ? "connected" : "error",
      last_checked_at: new Date().toISOString(),
      last_error: result.ok ? null : result.message,
    }).eq("id", row.id);

    return json(result);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
