import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Roles a non-superadmin admin is allowed to assign / manage
const ADMIN_ASSIGNABLE_ROLES = new Set(["admin", "cashier", "waiter", "kitchen"]);
// Roles a cashier is allowed to assign / manage (never admin/cashier/superadmin)
const CASHIER_ASSIGNABLE_ROLES = new Set(["waiter", "kitchen"]);
// Roles only a superadmin can assign / manage
const SUPERADMIN_ONLY_ROLES = new Set(["superadmin"]);

function generateTempPassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !caller) return json({ error: "Unauthorized" }, 401);

    // Resolve caller's privileges
    const { data: callerRoleRows } = await adminClient
      .from("user_roles")
      .select("role, establishment_id")
      .eq("user_id", caller.id);

    const roles = callerRoleRows || [];
    const isSuperadmin = roles.some((r: any) => r.role === "superadmin");
    const adminEstablishments = new Set(
      roles.filter((r: any) => r.role === "admin" && r.establishment_id).map((r: any) => r.establishment_id),
    );
    const isAdmin = adminEstablishments.size > 0;
    const cashierEstablishments = new Set(
      roles.filter((r: any) => r.role === "cashier" && r.establishment_id).map((r: any) => r.establishment_id),
    );
    const isCashier = !isAdmin && cashierEstablishments.size > 0;
    // Establishments the caller can operate on, and the roles they may assign
    const scopedEstablishments = isCashier ? cashierEstablishments : adminEstablishments;
    const assignableRoles = isCashier ? CASHIER_ASSIGNABLE_ROLES : ADMIN_ASSIGNABLE_ROLES;

    if (!isSuperadmin && !isAdmin && !isCashier) return json({ error: "Forbidden" }, 403);

    const body = await req.json();
    const { action } = body;

    // Helper: verify the caller is allowed to manage `targetRoleId`'s row
    const assertCanManageRoleRow = async (roleId: string) => {
      const { data: target } = await adminClient
        .from("user_roles")
        .select("role, establishment_id, user_id")
        .eq("id", roleId)
        .maybeSingle();
      if (!target) return { ok: false as const, status: 404, msg: "Role not found" };

      if (isSuperadmin) return { ok: true as const, target };

      // Cannot manage superadmin rows
      if (SUPERADMIN_ONLY_ROLES.has(target.role)) {
        return { ok: false as const, status: 403, msg: "Forbidden" };
      }
      // A cashier can only manage operational roles (waiter/kitchen)
      if (isCashier && !CASHIER_ASSIGNABLE_ROLES.has(target.role)) {
        return { ok: false as const, status: 403, msg: "Forbidden" };
      }
      // Can only manage rows inside their establishment(s)
      if (!target.establishment_id || !scopedEstablishments.has(target.establishment_id)) {
        return { ok: false as const, status: 403, msg: "Forbidden" };
      }
      return { ok: true as const, target };
    };

    // Helper: validate a (role, establishment_id) assignment is allowed for caller
    const assertCanAssign = (role: string, establishmentId: string | null) => {
      if (isSuperadmin) return { ok: true as const };
      if (!assignableRoles.has(role)) {
        return { ok: false as const, status: 403, msg: "No podés asignar este rol" };
      }
      if (!establishmentId || !scopedEstablishments.has(establishmentId)) {
        return { ok: false as const, status: 403, msg: "Cannot assign role outside your establishment" };
      }
      return { ok: true as const };
    };

    // CREATE USER
    if (!action || action === "create") {
      const { email, password, fullName, role, establishmentId } = body;
      const scoped = role === "superadmin" ? null : establishmentId || null;

      const check = assertCanAssign(role, scoped);
      if (!check.ok) return json({ error: check.msg }, check.status);

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createError) return json({ error: createError.message }, 400);

      const { error: roleError } = await adminClient.from("user_roles").insert({
        user_id: newUser.user.id,
        role,
        establishment_id: scoped,
      });
      if (roleError) return json({ error: roleError.message }, 400);

      return json({ user: newUser.user });
    }

    // UPDATE ROLE
    if (action === "update_role") {
      const { roleId, role, establishmentId } = body;
      const scoped = role === "superadmin" ? null : establishmentId || null;

      const owns = await assertCanManageRoleRow(roleId);
      if (!owns.ok) return json({ error: owns.msg }, owns.status);

      const assignCheck = assertCanAssign(role, scoped);
      if (!assignCheck.ok) return json({ error: assignCheck.msg }, assignCheck.status);

      const { error } = await adminClient
        .from("user_roles")
        .update({ role, establishment_id: scoped })
        .eq("id", roleId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // RESET PASSWORD
    if (action === "reset_password") {
      const { userId } = body;

      if (!isSuperadmin) {
        // Admin can only reset users that have a role row inside their establishment(s)
        // and that target user must NOT be a superadmin.
        const { data: targetRoles } = await adminClient
          .from("user_roles")
          .select("role, establishment_id")
          .eq("user_id", userId);

        const targets = targetRoles || [];
        if (targets.length === 0) return json({ error: "Forbidden" }, 403);
        if (targets.some((r: any) => r.role === "superadmin")) return json({ error: "Forbidden" }, 403);
        if (isCashier && !targets.every((r: any) => CASHIER_ASSIGNABLE_ROLES.has(r.role))) {
          return json({ error: "Forbidden" }, 403);
        }
        if (!targets.some((r: any) => r.establishment_id && scopedEstablishments.has(r.establishment_id))) {
          return json({ error: "Forbidden" }, 403);
        }
      }

      const tempPassword = generateTempPassword();
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password: tempPassword });
      if (error) return json({ error: error.message }, 400);

      // Return once; caller must communicate it to the user
      return json({ success: true, tempPassword });
    }

    // DELETE ROLE
    if (action === "delete_role") {
      const { roleId } = body;
      const owns = await assertCanManageRoleRow(roleId);
      if (!owns.ok) return json({ error: owns.msg }, owns.status);

      const { error } = await adminClient.from("user_roles").delete().eq("id", roleId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
