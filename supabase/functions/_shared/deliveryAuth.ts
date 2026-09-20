import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Validates the bearer token and returns the caller plus whether they may manage `establishmentId`. */
export async function requireEstablishmentAdmin(req: Request, establishmentId: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: json({ error: "No autorizado" }, 401) };

  const admin = adminClient();
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { error: json({ error: "No autorizado" }, 401) };

  const { data: roles } = await admin
    .from("user_roles")
    .select("role, establishment_id")
    .eq("user_id", user.id);

  const allowed = (roles || []).some((r: { role: string; establishment_id: string | null }) =>
    r.role === "superadmin" ||
    ((r.role === "admin" || r.role === "cashier") && r.establishment_id === establishmentId)
  );
  if (!allowed) return { error: json({ error: "No autorizado" }, 403) };

  return { admin, user };
}

export const PLATFORMS = ["rappi", "peya"] as const;
export type Platform = typeof PLATFORMS[number];

/** DB platform key -> value stored in orders.external_platform */
export const ORDER_PLATFORM: Record<Platform, string> = {
  rappi: "rappi",
  peya: "pedidosya",
};
