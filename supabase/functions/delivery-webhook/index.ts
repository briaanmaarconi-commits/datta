import { corsHeaders, json, adminClient, ORDER_PLATFORM, type Platform } from "../_shared/deliveryAuth.ts";

/**
 * Public ingestion endpoint for Rappi / PedidosYa.
 * URL: /functions/v1/delivery-webhook?token=<webhook_token>
 *
 * Expected (normalised) payload:
 * {
 *   "external_order_id": "R-12345",
 *   "customer": { "name": "...", "phone": "...", "address": "..." },
 *   "delivery_fee": 1200,
 *   "items": [{ "id": "SKU-1", "name": "Milanesa", "quantity": 2, "unit_price": 9000, "notes": "" }]
 * }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? req.headers.get("x-datta-token") ?? "";
    if (!token) return json({ error: "Token faltante" }, 401);

    const admin = adminClient();
    const { data: integration } = await admin
      .from("delivery_integrations")
      .select("id, establishment_id, platform")
      .eq("webhook_token", token)
      .maybeSingle();

    if (!integration) return json({ error: "Token inválido" }, 401);

    const establishmentId = integration.establishment_id as string;
    const platform = integration.platform as Platform;
    const orderPlatform = ORDER_PLATFORM[platform];

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") return json({ error: "Payload inválido" }, 400);

    const externalOrderId = String(payload.external_order_id ?? payload.id ?? "").trim();
    if (!externalOrderId) return json({ error: "external_order_id requerido" }, 400);

    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    if (rawItems.length === 0) return json({ error: "El pedido no trae ítems" }, 400);

    // Idempotency
    const { data: dupe } = await admin
      .from("orders")
      .select("id")
      .eq("establishment_id", establishmentId)
      .eq("external_order_id", externalOrderId)
      .maybeSingle();
    if (dupe) return json({ ok: true, duplicated: true, order_id: dupe.id });

    // Resolve mapping
    const externalIds = rawItems.map((i: Record<string, unknown>) => String(i.id ?? i.sku ?? "")).filter(Boolean);
    const { data: mappings } = await admin
      .from("delivery_menu_mapping")
      .select("external_item_id, product_id")
      .eq("establishment_id", establishmentId)
      .eq("platform", platform)
      .in("external_item_id", externalIds.length ? externalIds : ["__none__"]);

    const mapByExternal = new Map(
      (mappings || []).map((m: { external_item_id: string; product_id: string | null }) => [m.external_item_id, m.product_id]),
    );

    const unmapped: { id: string; name: string }[] = [];
    const lines: { product_id: string; quantity: number; unit_price: number; notes: string | null }[] = [];

    for (const raw of rawItems) {
      const item = raw as Record<string, unknown>;
      const extId = String(item.id ?? item.sku ?? "");
      const name = String(item.name ?? extId);
      const productId = extId ? mapByExternal.get(extId) : null;
      if (!productId) {
        unmapped.push({ id: extId, name });
        continue;
      }
      lines.push({
        product_id: productId,
        quantity: Math.max(1, Number(item.quantity ?? 1)),
        unit_price: Number(item.unit_price ?? item.price ?? 0),
        notes: item.notes ? String(item.notes) : null,
      });
    }

    if (unmapped.length > 0) {
      // Record placeholders so the restaurant can finish the mapping from the UI.
      await admin.from("delivery_menu_mapping").upsert(
        unmapped.map((u) => ({
          establishment_id: establishmentId,
          platform,
          external_item_id: u.id || u.name,
          external_item_name: u.name,
          product_id: null,
        })),
        { onConflict: "establishment_id,platform,external_item_id", ignoreDuplicates: true },
      );
      return json({ error: "Hay ítems sin mapear en Datta", unmapped }, 422);
    }

    const subtotal = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0);
    const deliveryFee = Number(payload.delivery_fee ?? 0);

    const { data: est } = await admin
      .from("establishments")
      .select("rappi_commission, peya_commission")
      .eq("id", establishmentId)
      .maybeSingle();

    const pct = Number((platform === "rappi" ? est?.rappi_commission : est?.peya_commission) ?? 0);
    const commission = subtotal * (pct / 100);

    const customer = (payload.customer ?? {}) as Record<string, unknown>;

    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        establishment_id: establishmentId,
        table_id: null,
        status: "new",
        total: subtotal + deliveryFee,
        channel: "delivery",
        external_platform: orderPlatform,
        external_order_id: externalOrderId,
        delivery_fee: deliveryFee,
        platform_commission: commission,
        customer_name: customer.name ? String(customer.name) : null,
        delivery_address: {
          address: customer.address ? String(customer.address) : null,
          phone: customer.phone ? String(customer.phone) : null,
        },
      })
      .select("id")
      .single();

    if (orderError) throw orderError;

    const { error: itemsError } = await admin.from("order_items").insert(
      lines.map((l) => ({
        order_id: order.id,
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        notes: l.notes,
        status: "pending",
      })),
    );
    if (itemsError) throw itemsError;

    return json({ ok: true, order_id: order.id });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
