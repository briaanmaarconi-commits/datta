import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import forge from 'https://esm.sh/node-forge@1.3.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const { establishment_id, action } = await req.json();
    if (!establishment_id) {
      return new Response(JSON.stringify({ error: 'Falta establishment_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // El usuario debe ser admin/superadmin del establecimiento
    const { data: roles } = await admin
      .from('user_roles')
      .select('role, establishment_id')
      .eq('user_id', userId);

    const allowed = (roles ?? []).some(
      (r: any) =>
        r.role === 'superadmin' ||
        (r.role === 'admin' && r.establishment_id === establishment_id),
    );
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Permisos insuficientes' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Descarga de la clave privada ya generada
    if (action === 'download_key') {
      const { data: row } = await admin
        .from('afip_certificates')
        .select('private_key_pem')
        .eq('establishment_id', establishment_id)
        .maybeSingle();

      const keyPem = (row as any)?.private_key_pem;
      if (!keyPem || !String(keyPem).trim()) {
        return new Response(
          JSON.stringify({ error: 'No hay clave privada generada. Generá primero el CSR.' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { data: est2 } = await admin
        .from('establishments')
        .select('cuit')
        .eq('id', establishment_id)
        .single();
      const cuitKey = ((est2 as any)?.cuit ?? '').replace(/\D/g, '') || 'datta';

      return new Response(
        JSON.stringify({ key: keyPem, filename: `datta-${cuitKey}.key` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }



    const { data: est, error: estErr } = await admin
      .from('establishments')
      .select('name, cuit, razon_social')
      .eq('id', establishment_id)
      .single();
    if (estErr || !est) throw new Error('Establecimiento no encontrado');

    const cuit = (est.cuit ?? '').replace(/\D/g, '');
    if (cuit.length !== 11) {
      return new Response(
        JSON.stringify({ error: 'Cargá y guardá primero un CUIT válido (11 dígitos) en los datos fiscales.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const commonName = (est.razon_social || est.name || 'datta')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9 ._-]/g, '')
      .slice(0, 50) || 'datta';

    // 1. Generar par de claves RSA 2048
    const keys = forge.pki.rsa.generateKeyPair(2048);

    // 2. Armar el CSR con los atributos que exige ARCA/AFIP
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = keys.publicKey;
    csr.setSubject([
      { name: 'countryName', value: 'AR' },
      { name: 'organizationName', value: commonName },
      { name: 'commonName', value: commonName },
      { name: 'serialNumber', type: '2.5.4.5', value: `CUIT ${cuit}` },
    ]);
    csr.sign(keys.privateKey, forge.md.sha256.create());

    const csrPem = forge.pki.certificationRequestToPem(csr);
    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

    // 3. Guardar la clave privada (nunca se devuelve al cliente)
    const { data: existing } = await admin
      .from('afip_certificates')
      .select('id')
      .eq('establishment_id', establishment_id)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from('afip_certificates')
        .update({ private_key_pem: keyPem, certificate_pem: '' })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await admin.from('afip_certificates').insert({
        establishment_id,
        private_key_pem: keyPem,
        certificate_pem: '',
      });
      if (error) throw error;
    }

    return new Response(
      JSON.stringify({
        csr: csrPem,
        filename: `datta-${cuit}.csr`,
        subject: `C=AR, O=${commonName}, CN=${commonName}, serialNumber=CUIT ${cuit}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('afip-csr error', e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? 'Error generando CSR' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
