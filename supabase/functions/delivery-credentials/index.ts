import { corsHeaders, json, requireEstablishmentAdmin, PLATFORMS, type Platform } from "../_shared/deliveryAuth.ts";

interface Body {
  establishment_id?: string;
  platform?: string;
  environment?: string;
  store_id?: string | null;
  external_vendor_id?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  api_key?: string | null;
  regenerate_webhook_token?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const establishmentId = body.establishment_id;
    const platform = body.platform as Platform | undefined;

    if (!establishmentId || typeof establishmentId !== "string") {
      return json({ error: "establishment_id requerido" }, 400);
    }
    if (!platform || !PLATFORMS.includes(platform)) {
      return json({ error: "platform inválida (rappi | peya)" }, 400);
    }
    const environment = body.environment === "production" ? "production" : "sandbox";

    const auth = await requireEstablishmentAdmin(req, establishmentId);
    if ("error" in auth) return auth.error;
    const admin = auth.admin!;

    const { data: existing } = await admin
      .from("delivery_integrations")
      .select("id, credentials, secret_last4")
      .eq("establishment_id", establishmentId)
      .eq("platform", platform)
      .maybeSingle();

    const prevCreds = (existing?.credentials ?? {}) as Record<string, string>;
    const credentials: Record<string, string> = { ...prevCreds };

    const secret = (body.client_secret ?? "").trim();
    const apiKey = (body.api_key ?? "").trim();
    if (secret) credentials.client_secret = secret;
    if (apiKey) credentials.api_key = apiKey;

    const newestSecret = secret || apiKey;
    const secretLast4 = newestSecret
      ? newestSecret.slice(-4)
      : (existing?.secret_last4 ?? null);

    const hasCreds = !!(credentials.client_secret || credentials.api_key);

    const payload: Record<string, unknown> = {
      establishment_id: establishmentId,
      platform,
      environment,
      store_id: body.store_id?.toString().trim() || null,
      external_vendor_id: body.external_vendor_id?.toString().trim() || null,
      client_id: body.client_id?.toString().trim() || null,
      credentials,
      secret_last4: secretLast4,
      status: hasCreds ? "configured" : "not_configured",
      last_error: null,
    };

    if (body.regenerate_webhook_token) {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      payload.webhook_token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }

    if (existing) {
      const { error } = await admin
        .from("delivery_integrations")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await admin.from("delivery_integrations").insert(payload);
      if (error) throw error;
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
