import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const tools = [
  {
    type: "function",
    function: {
      name: "update_product",
      description: "Update one or more fields of a product (price, cost, tax, promo, availability, name, description). Use product name to find it first from context.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "UUID of the product" },
          updates: {
            type: "object",
            properties: {
              price: { type: "number", description: "New selling price" },
              cost: { type: "number", description: "New cost" },
              tax_percentage: { type: "number", description: "New tax percentage (IVA)" },
              promo_active: { type: "boolean", description: "Enable/disable promo" },
              promo_price: { type: "number", description: "Promo price (null to remove)", nullable: true },
              is_available: { type: "boolean", description: "Product availability" },
              name: { type: "string", description: "Product name" },
              description: { type: "string", description: "Product description", nullable: true },
            },
            additionalProperties: false,
          },
        },
        required: ["product_id", "updates"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_category",
      description: "Update a menu category (name, is_active, sort_order).",
      parameters: {
        type: "object",
        properties: {
          category_id: { type: "string", description: "UUID of the category" },
          updates: {
            type: "object",
            properties: {
              name: { type: "string" },
              is_active: { type: "boolean" },
              sort_order: { type: "integer" },
            },
            additionalProperties: false,
          },
        },
        required: ["category_id", "updates"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_update_prices",
      description: "Increase or decrease prices for all products in a category by a percentage.",
      parameters: {
        type: "object",
        properties: {
          category_id: { type: "string", description: "UUID of the category (use 'all' for all products)" },
          percentage: { type: "number", description: "Percentage change (positive = increase, negative = decrease). E.g. 10 means +10%" },
        },
        required: ["category_id", "percentage"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "toggle_product_availability",
      description: "Mark one or multiple products as available or unavailable.",
      parameters: {
        type: "object",
        properties: {
          product_ids: { type: "array", items: { type: "string" }, description: "Array of product UUIDs" },
          is_available: { type: "boolean", description: "true = available, false = unavailable" },
        },
        required: ["product_ids", "is_available"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_table_status",
      description: "Change a table's status (free, occupied, billing).",
      parameters: {
        type: "object",
        properties: {
          table_id: { type: "string", description: "UUID of the table" },
          status: { type: "string", enum: ["free", "occupied", "billing"] },
        },
        required: ["table_id", "status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_product",
      description: "Create a new product in the menu.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          category_id: { type: "string", description: "UUID of the category" },
          price: { type: "number" },
          cost: { type: "number" },
          tax_percentage: { type: "number", description: "IVA percentage (0, 10.5, 21, 27)" },
          description: { type: "string", nullable: true },
        },
        required: ["name", "category_id", "price"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_category",
      description: "Create a new menu category.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_finance_transaction",
      description: "Registrar un movimiento financiero (ingreso o egreso): alquiler, sueldos, impuestos, servicios, marketing, invitaciones, otros ingresos, etc. Usá list_finance_categories o el contexto para obtener el category_id correcto. Si no existe la categoría, creala con create_finance_category.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["income", "expense"], description: "income = ingreso, expense = egreso" },
          amount: { type: "number", description: "Monto en pesos (positivo)" },
          category_id: { type: "string", description: "UUID de la categoría financiera" },
          description: { type: "string", description: "Descripción del movimiento", nullable: true },
          date: { type: "string", description: "Fecha YYYY-MM-DD. Si no se especifica, usa hoy.", nullable: true },
        },
        required: ["type", "amount", "category_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_finance_transaction",
      description: "Modificar un movimiento financiero existente (cambiar monto, descripción, categoría, fecha o tipo).",
      parameters: {
        type: "object",
        properties: {
          transaction_id: { type: "string", description: "UUID de la transacción" },
          updates: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["income", "expense"] },
              amount: { type: "number" },
              category_id: { type: "string" },
              description: { type: "string", nullable: true },
              date: { type: "string" },
            },
            additionalProperties: false,
          },
        },
        required: ["transaction_id", "updates"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_finance_transaction",
      description: "Eliminar un movimiento financiero por ID.",
      parameters: {
        type: "object",
        properties: {
          transaction_id: { type: "string" },
        },
        required: ["transaction_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_finance_category",
      description: "Crear una nueva categoría financiera (de ingreso o egreso). Usar solo si no existe ya una categoría adecuada.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["income", "expense"] },
        },
        required: ["name", "type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_finance_categories",
      description: "Listar todas las categorías financieras disponibles con sus IDs y tipos.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];


// Execute a tool call against the DB
async function executeTool(
  db: ReturnType<typeof createClient>,
  establishmentId: string | null,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    // Helper: when caller is not superadmin (i.e. has an establishmentId), restrict the mutation
    const scope = <T extends { eq: (col: string, val: unknown) => T }>(q: T): T =>
      establishmentId ? q.eq("establishment_id", establishmentId) : q;

    switch (name) {
      case "update_product": {
        const { product_id, updates } = args as { product_id: string; updates: Record<string, unknown> };
        const allowed = ["price", "cost", "tax_percentage", "promo_active", "promo_price", "is_available", "name", "description"];
        const clean: Record<string, unknown> = {};
        for (const k of allowed) if (updates[k] !== undefined) clean[k] = updates[k];
        if (Object.keys(clean).length === 0) return "No valid fields to update.";
        const { error } = await scope(db.from("products").update(clean).eq("id", product_id));
        if (error) return `Error: ${error.message}`;
        return `Producto actualizado correctamente: ${JSON.stringify(clean)}`;
      }

      case "update_category": {
        const { category_id, updates } = args as { category_id: string; updates: Record<string, unknown> };
        const allowed = ["name", "is_active", "sort_order"];
        const clean: Record<string, unknown> = {};
        for (const k of allowed) if (updates[k] !== undefined) clean[k] = updates[k];
        const { error } = await scope(db.from("categories").update(clean).eq("id", category_id));
        if (error) return `Error: ${error.message}`;
        return `Categoría actualizada: ${JSON.stringify(clean)}`;
      }

      case "bulk_update_prices": {
        const { category_id, percentage } = args as { category_id: string; percentage: number };
        let query = db.from("products").select("id, price");
        if (establishmentId) query = query.eq("establishment_id", establishmentId);
        if (category_id !== "all") query = query.eq("category_id", category_id);
        const { data: products, error: fetchErr } = await query;
        if (fetchErr) return `Error: ${fetchErr.message}`;
        if (!products || products.length === 0) return "No se encontraron productos.";

        let updated = 0;
        for (const p of products) {
          const newPrice = Math.round(Number(p.price) * (1 + percentage / 100) * 100) / 100;
          const { error } = await scope(db.from("products").update({ price: newPrice }).eq("id", p.id));
          if (!error) updated++;
        }
        return `Se actualizaron ${updated}/${products.length} productos con un ${percentage > 0 ? "aumento" : "descuento"} del ${Math.abs(percentage)}%.`;
      }

      case "toggle_product_availability": {
        const { product_ids, is_available } = args as { product_ids: string[]; is_available: boolean };
        const { error } = await scope(db.from("products").update({ is_available }).in("id", product_ids));
        if (error) return `Error: ${error.message}`;
        return `${product_ids.length} producto(s) marcados como ${is_available ? "disponibles" : "no disponibles"}.`;
      }

      case "update_table_status": {
        const { table_id, status } = args as { table_id: string; status: string };
        const { error } = await scope(db.from("tables").update({ status }).eq("id", table_id));
        if (error) return `Error: ${error.message}`;
        return `Mesa actualizada a estado: ${status}`;
      }


      case "create_product": {
        const { name: pName, category_id, price, cost, tax_percentage, description } = args as any;
        const { error } = await db.from("products").insert({
          name: pName,
          category_id,
          establishment_id: establishmentId,
          price: price || 0,
          cost: cost || 0,
          tax_percentage: tax_percentage || 0,
          description: description || null,
        });
        if (error) return `Error: ${error.message}`;
        return `Producto "${pName}" creado exitosamente con precio $${price}.`;
      }

      case "create_category": {
        const { name: cName } = args as { name: string };
        const { error } = await db.from("categories").insert({
          name: cName,
          establishment_id: establishmentId,
        });
        if (error) return `Error: ${error.message}`;
        return `Categoría "${cName}" creada exitosamente.`;
      }

      case "create_finance_transaction": {
        const { type, amount, category_id, description, date } = args as any;
        if (!establishmentId) return "Error: no se puede registrar movimientos sin un establecimiento asociado.";
        if (!["income", "expense"].includes(type)) return "Error: tipo inválido.";
        if (!amount || Number(amount) <= 0) return "Error: el monto debe ser mayor a cero.";
        // Validate category belongs to establishment and matches type
        const { data: cat, error: catErr } = await db.from("finance_categories")
          .select("id, name, type").eq("id", category_id).eq("establishment_id", establishmentId).maybeSingle();
        if (catErr || !cat) return "Error: categoría no encontrada para este establecimiento.";
        if (cat.type !== type) return `Error: la categoría "${cat.name}" es de tipo ${cat.type}, no ${type}.`;
        const { data, error } = await db.from("finance_transactions").insert({
          establishment_id: establishmentId,
          type,
          amount: Number(amount),
          category_id,
          description: description || null,
          date: date || new Date().toISOString().split("T")[0],
          created_by: null,
        }).select("id, date, amount").single();
        if (error) return `Error: ${error.message}`;
        return `Movimiento registrado: ${type === "income" ? "Ingreso" : "Egreso"} de $${Number(amount).toLocaleString("es-AR")} en "${cat.name}" (fecha ${data.date}, ID: ${data.id}).`;
      }

      case "update_finance_transaction": {
        const { transaction_id, updates } = args as { transaction_id: string; updates: Record<string, unknown> };
        const allowed = ["type", "amount", "category_id", "description", "date"];
        const clean: Record<string, unknown> = {};
        for (const k of allowed) if (updates[k] !== undefined) clean[k] = updates[k];
        if (Object.keys(clean).length === 0) return "No hay campos válidos para actualizar.";
        if (clean.category_id && establishmentId) {
          const { data: cat } = await db.from("finance_categories")
            .select("id, type").eq("id", clean.category_id as string).eq("establishment_id", establishmentId).maybeSingle();
          if (!cat) return "Error: categoría no encontrada para este establecimiento.";
        }
        const { error } = await scope(db.from("finance_transactions").update(clean).eq("id", transaction_id));
        if (error) return `Error: ${error.message}`;
        return `Movimiento actualizado: ${JSON.stringify(clean)}`;
      }

      case "delete_finance_transaction": {
        const { transaction_id } = args as { transaction_id: string };
        const { error } = await scope(db.from("finance_transactions").delete().eq("id", transaction_id));
        if (error) return `Error: ${error.message}`;
        return `Movimiento eliminado correctamente.`;
      }

      case "create_finance_category": {
        const { name: cName, type } = args as { name: string; type: string };
        if (!establishmentId) return "Error: sin establecimiento asociado.";
        if (!["income", "expense"].includes(type)) return "Error: tipo inválido.";
        const { data, error } = await db.from("finance_categories").insert({
          name: cName, type, establishment_id: establishmentId,
        }).select("id").single();
        if (error) return `Error: ${error.message}`;
        return `Categoría financiera "${cName}" (${type}) creada. ID: ${data.id}`;
      }

      case "list_finance_categories": {
        let q = db.from("finance_categories").select("id, name, type").order("type").order("name");
        if (establishmentId) q = q.eq("establishment_id", establishmentId);
        const { data, error } = await q;
        if (error) return `Error: ${error.message}`;
        return (data || []).map((c: any) => `[${c.id}] ${c.name} (${c.type})`).join("\n") || "Sin categorías.";
      }


      default:
        return `Herramienta desconocida: ${name}`;
    }
  } catch (e) {
    return `Error ejecutando ${name}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    // Service role client for unrestricted DB access
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check role and get establishment
    const { data: roleData } = await db.from("user_roles").select("role, establishment_id")
      .eq("user_id", userId).in("role", ["admin", "superadmin"]).limit(1).maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const establishmentId = roleData.establishment_id;
    const { messages } = await req.json();

    // Gather restaurant data
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

    const eqFilter = (q: any) => establishmentId ? q.eq("establishment_id", establishmentId) : q;

    const [
      ordersToday, ordersWeek, ordersMonth,
      productsRes, tablesRes, financeRes, shiftRes, categoriesRes, financeCatsRes,
      insightsRes,
    ] = await Promise.all([
      eqFilter(db.from("orders").select("id, total, status, payment_method, created_at").gte("created_at", today)),
      eqFilter(db.from("orders").select("id, total, status, created_at").gte("created_at", weekAgo)),
      eqFilter(db.from("orders").select("id, total, status, created_at").gte("created_at", monthAgo)),
      eqFilter(db.from("products").select("id, name, price, cost, tax_percentage, promo_active, promo_price, is_available, category_id")),
      eqFilter(db.from("tables").select("id, number, status, capacity")),
      eqFilter(db.from("finance_transactions").select("id, type, amount, description, date, category_id").gte("date", monthAgo).order("date", { ascending: false }).limit(50)),
      eqFilter(db.from("shift_controls").select("*").order("shift_date", { ascending: false }).limit(5)),
      eqFilter(db.from("categories").select("id, name")),
      eqFilter(db.from("finance_categories").select("id, name, type").order("type")),
      eqFilter(db.from("ai_insights").select("id, kind, severity, category, title, body, status, created_at").neq("status", "dismissed").order("created_at", { ascending: false }).limit(15)),
    ]);


    // Top sold products (from order_items in last 30 days)
    const orderIds = (ordersMonth.data || []).map((o: any) => o.id);
    let topProducts: any[] = [];
    if (orderIds.length > 0) {
      const { data: items } = await db.from("order_items").select("product_id, quantity, unit_price").in("order_id", orderIds.slice(0, 500));
      if (items) {
        const agg: Record<string, { qty: number; revenue: number }> = {};
        for (const i of items) {
          if (!agg[i.product_id]) agg[i.product_id] = { qty: 0, revenue: 0 };
          agg[i.product_id].qty += i.quantity;
          agg[i.product_id].revenue += i.quantity * Number(i.unit_price);
        }
        const productMap = Object.fromEntries((productsRes.data || []).map((p: any) => [p.id, p.name]));
        topProducts = Object.entries(agg)
          .map(([pid, v]) => ({ name: productMap[pid] || pid, ...v }))
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 15);
      }
    }

    const ot = ordersToday.data || [];
    const ow = ordersWeek.data || [];
    const closedToday = ot.filter((o: any) => o.status === "closed");
    const closedWeek = ow.filter((o: any) => o.status === "closed");
    const salesToday = closedToday.reduce((s: number, o: any) => s + Number(o.total), 0);
    const salesWeek = closedWeek.reduce((s: number, o: any) => s + Number(o.total), 0);
    const avgTicketToday = closedToday.length ? salesToday / closedToday.length : 0;

    const tables = tablesRes.data || [];
    const products = productsRes.data || [];
    const categories = categoriesRes.data || [];
    const catMap = Object.fromEntries(categories.map((c: any) => [c.id, c.name]));

    const productsSummary = products.map((p: any) => {
      const margin = p.cost > 0 ? ((p.price * (1 - p.tax_percentage / 100) - p.cost) / p.cost * 100).toFixed(1) : "N/A";
      return `- [ID: ${p.id}] ${p.name} (Cat: ${catMap[p.category_id] || "?"} [${p.category_id}]) | Precio: $${p.price} | Costo: $${p.cost} | IVA: ${p.tax_percentage}% | Margen: ${margin}% | ${p.is_available ? "Disponible" : "No disponible"}${p.promo_active ? ` | PROMO: $${p.promo_price}` : ""}`;
    }).join("\n");

    const categoriesSummary = categories.map((c: any) => `- [ID: ${c.id}] ${c.name}`).join("\n");

    const tablesSummary = tables.map((t: any) => `- [ID: ${t.id}] Mesa ${t.number}: ${t.status} (cap: ${t.capacity})`).join("\n");

    const finances = financeRes.data || [];
    const incomes = finances.filter((f: any) => f.type === "income");
    const expenses = finances.filter((f: any) => f.type === "expense");
    const totalIncome = incomes.reduce((s: number, f: any) => s + Number(f.amount), 0);
    const totalExpense = expenses.reduce((s: number, f: any) => s + Number(f.amount), 0);

    const paymentMethods: Record<string, number> = {};
    for (const o of closedToday) {
      const m = (o as any).payment_method || "sin especificar";
      paymentMethods[m] = (paymentMethods[m] || 0) + 1;
    }

    const contextBlock = `
=== DATOS DEL RESTAURANTE (actualizado ahora) ===

📊 VENTAS HOY:
- Pedidos totales: ${ot.length} (cerrados: ${closedToday.length})
- Ventas: $${salesToday.toFixed(2)}
- Ticket promedio: $${avgTicketToday.toFixed(2)}
- Métodos de pago: ${Object.entries(paymentMethods).map(([k, v]) => `${k}: ${v}`).join(", ") || "N/A"}

📊 VENTAS SEMANA:
- Pedidos cerrados: ${closedWeek.length}
- Ventas: $${salesWeek.toFixed(2)}

🍽️ MESAS:
${tablesSummary || "Sin mesas"}

🏆 TOP PRODUCTOS VENDIDOS (últimos 30 días):
${topProducts.map((p, i) => `${i + 1}. ${p.name}: ${p.qty} unidades, $${p.revenue.toFixed(2)}`).join("\n") || "Sin datos"}

📂 CATEGORÍAS:
${categoriesSummary || "Sin categorías"}

📦 PRODUCTOS Y MÁRGENES:
${productsSummary || "Sin productos"}

💰 FINANZAS (últimos 30 días):
- Ingresos: $${totalIncome.toFixed(2)} (${incomes.length} transacciones)
- Egresos: $${totalExpense.toFixed(2)} (${expenses.length} transacciones)
- Balance: $${(totalIncome - totalExpense).toFixed(2)}

📒 CATEGORÍAS FINANCIERAS DISPONIBLES (usar estos IDs al crear/editar movimientos):
${(financeCatsRes.data || []).map((c: any) => `- [ID: ${c.id}] ${c.name} (${c.type})`).join("\n") || "Sin categorías financieras"}

📝 ÚLTIMOS MOVIMIENTOS FINANCIEROS:
${finances.slice(0, 20).map((f: any) => `- [ID: ${f.id}] ${f.date} | ${f.type === "income" ? "Ingreso" : "Egreso"} $${Number(f.amount).toLocaleString("es-AR")} | ${f.description || "sin descripción"}`).join("\n") || "Sin movimientos"}

🕐 TURNOS RECIENTES:
${(shiftRes.data || []).map((s: any) => `- ${s.shift_date}: ${s.opened_at ? "Abierto" : "No abierto"} ${s.closed_at ? "| Cerrado" : ""} ${s.is_controlled ? "| Controlado" : ""}`).join("\n") || "Sin datos"}

🤖 ALERTAS Y RECOMENDACIONES IA RECIENTES (de la última semana):
${(insightsRes.data || []).map((i: any) => `- [${i.kind === "alert" ? "ALERTA" : "SUGERENCIA"} - ${i.severity} - ${i.category}] ${i.title}: ${i.body}`).join("\n") || "Sin alertas activas"}
`;

    const systemPrompt = `Eres el asistente inteligente de Datta, un sistema de gestión de restaurantes. 
Respondes en español argentino de forma clara y concisa.
Tienes acceso a los datos actualizados del restaurante y TAMBIÉN puedes ejecutar acciones.

CAPACIDADES DE ACCIÓN:
- Cambiar precios, costos, impuestos de productos
- Activar/desactivar promociones
- Marcar productos como disponibles/no disponibles
- Crear nuevos productos y categorías
- Ajustar precios masivamente por categoría o globalmente
- Cambiar estado de mesas
- Modificar nombres y descripciones de productos y categorías
- Registrar, modificar y eliminar movimientos financieros (alquiler, sueldos, impuestos, servicios, marketing, invitaciones, ingresos varios, etc.)
- Crear nuevas categorías financieras cuando no exista una adecuada


REGLAS IMPORTANTES:
1. Siempre confirmá con el usuario antes de hacer cambios masivos (ej: "¿Estás seguro de aumentar todos los precios un 10%?")
2. Para cambios individuales, ejecutalos directamente si el usuario lo pidió claramente.
3. Después de ejecutar una acción, informá exactamente qué se cambió.
4. Usá los IDs de los datos proporcionados abajo para las operaciones.
5. Si el usuario pide algo que no podés hacer con las herramientas disponibles, decile honestamente.
6. Sé proactivo: si ves márgenes bajos, productos sin vender, etc., menciónalo.
7. Formatea respuestas con markdown (tablas, listas, negritas).

${contextBlock}`;

    // Build messages for AI with tools - use non-streaming for tool calls
    const aiMessages = [{ role: "system", content: systemPrompt }, ...messages];

    // Tool call loop: keep calling AI until no more tool calls
    let currentMessages = [...aiMessages];
    const MAX_TOOL_ROUNDS = 5;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-5",
          messages: currentMessages,
          tools,
          stream: false,
        }),
      });

      if (!aiResp.ok) {
        if (aiResp.status === 429) {
          return new Response(JSON.stringify({ error: "Demasiadas solicitudes, intentá de nuevo en un momento." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResp.status === 402) {
          return new Response(JSON.stringify({ error: "Créditos agotados." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await aiResp.text();
        console.error("AI gateway error:", aiResp.status, t);
        return new Response(JSON.stringify({ error: "Error del asistente" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiResp.json();
      const choice = aiData.choices?.[0];
      if (!choice) break;

      const assistantMsg = choice.message;
      currentMessages.push(assistantMsg);

      // If there are tool calls, execute them
      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        for (const tc of assistantMsg.tool_calls) {
          const fnName = tc.function.name;
          let fnArgs: Record<string, unknown> = {};
          try {
            fnArgs = JSON.parse(tc.function.arguments);
          } catch {
            fnArgs = {};
          }

          console.log(`Executing tool: ${fnName}`, fnArgs);
          const result = await executeTool(db, establishmentId, fnName, fnArgs);
          console.log(`Tool result: ${result}`);

          currentMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }
        // Continue loop to let AI process tool results
        continue;
      }

      // No tool calls - return the response as SSE
      const content = assistantMsg.content || "No pude generar una respuesta.";
      const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
      return new Response(sseData, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // If we exhausted rounds, return last assistant message
    const lastAssistant = currentMessages.filter((m: any) => m.role === "assistant").pop();
    const fallbackContent = lastAssistant?.content || "Se completaron las acciones solicitadas.";
    const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content: fallbackContent } }] })}\n\ndata: [DONE]\n\n`;
    return new Response(sseData, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (e) {
    console.error("restaurant-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
