import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const SYSTEM = `Sos un asistente que lee facturas y remitos de compra de un restaurante argentino.
Devolvés SOLO un JSON válido, sin texto extra, con esta forma:
{
  "supplier": string,            // nombre del proveedor, "" si no se lee
  "invoice_number": string,      // número de comprobante, "" si no se lee
  "invoice_date": string,        // formato YYYY-MM-DD, "" si no se lee
  "total": number,               // total final del comprobante, 0 si no se lee
  "items": [
    { "item_name": string, "quantity": number, "unit": string, "unit_price": number, "line_total": number }
  ]
}
Reglas:
- Los montos son números sin símbolos ni separadores de miles (ej: 12500.5).
- unit debe ser una de: kg, g, Lt, ml, unidad, bulto, docena, caja. Si no se sabe, usar "unidad".
- Si un dato no se entiende, dejalo vacío o en 0. Nunca inventes.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'Falta configurar LOVABLE_API_KEY' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => null);
    const fileData: string | undefined = body?.fileData;
    const mimeType: string | undefined = body?.mimeType;
    const filename: string = body?.filename || 'factura';

    if (!fileData || typeof fileData !== 'string' || !mimeType || typeof mimeType !== 'string') {
      return new Response(JSON.stringify({ error: 'Se requiere el archivo (fileData) y su tipo (mimeType)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isPdf = mimeType === 'application/pdf';
    const dataUrl = fileData.startsWith('data:') ? fileData : `data:${mimeType};base64,${fileData}`;

    const contentBlock = isPdf
      ? { type: 'file', file: { filename, file_data: dataUrl } }
      : { type: 'image_url', image_url: { url: dataUrl } };

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: [{ type: 'text', text: 'Leé esta factura de compra y devolvé el JSON.' }, contentBlock] },
        ],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      console.error('AI gateway error', aiRes.status, detail);
      const msg = aiRes.status === 429
        ? 'Demasiadas lecturas seguidas. Esperá unos segundos y probá de nuevo.'
        : aiRes.status === 402
          ? 'No hay créditos de IA disponibles para leer la factura.'
          : `No se pudo leer la factura (${aiRes.status}).`;
      return new Response(JSON.stringify({ error: msg, details: detail }), {
        status: aiRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await aiRes.json();
    const raw: string = payload?.choices?.[0]?.message?.content ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return new Response(JSON.stringify({ error: 'No se pudo interpretar el comprobante. Cargalo a mano.' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return new Response(JSON.stringify({ error: 'No se pudo interpretar el comprobante. Cargalo a mano.' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const result = {
      supplier: String(parsed.supplier ?? ''),
      invoice_number: String(parsed.invoice_number ?? ''),
      invoice_date: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.invoice_date ?? '')) ? String(parsed.invoice_date) : '',
      total: num(parsed.total),
      items: Array.isArray(parsed.items)
        ? parsed.items.slice(0, 60).map((i: any) => ({
            item_name: String(i?.item_name ?? '').slice(0, 200),
            quantity: num(i?.quantity),
            unit: String(i?.unit ?? 'unidad').slice(0, 20),
            unit_price: num(i?.unit_price),
            line_total: num(i?.line_total) || num(i?.quantity) * num(i?.unit_price),
          }))
        : [],
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('parse-invoice error', e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? 'Error inesperado' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
