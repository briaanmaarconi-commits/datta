import { useState } from 'react';
import { invokeAfip } from '@/lib/afipInvoke';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Save, Upload, CheckCircle, Loader2, ShieldCheck, FileKey } from 'lucide-react';

export default function FiscalSettingsCard() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();

  const { data: establishment } = useQuery({
    queryKey: ['establishment-fiscal', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('establishments')
        .select('cuit, razon_social, domicilio_comercial, iibb, inicio_actividades, condicion_iva, punto_venta_afip, afip_environment')
        .eq('id', establishmentId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const { data: certRow } = useQuery({
    queryKey: ['afip-certificate', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_afip_cert_status' as any, {
        _establishment_id: establishmentId!,
      });
      if (error) throw error;
      const st = data as any;
      if (!st?.exists) return null;
      return {
        id: st.id as string,
        expires_at: st.expires_at as string | null,
        hasCert: !!st.has_cert,
        hasKey: !!st.has_key,
      };
    },
    enabled: !!establishmentId,
  });
  const hasCertificate = certRow?.hasCert ? certRow : null;


  const [cuit, setCuit] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [domicilio, setDomicilio] = useState('');
  const [iibb, setIibb] = useState('');
  const [inicioActividades, setInicioActividades] = useState('');
  const [condicionIva, setCondicionIva] = useState('monotributo');
  const [puntoVenta, setPuntoVenta] = useState('');
  const [afipEnvironment, setAfipEnvironment] = useState('testing');
  const [initialized, setInitialized] = useState(false);

  // Initialize form with existing data
  if (establishment && !initialized) {
    setCuit(establishment.cuit || '');
    setRazonSocial(establishment.razon_social || '');
    setDomicilio(establishment.domicilio_comercial || '');
    setIibb(establishment.iibb || '');
    setInicioActividades(establishment.inicio_actividades || '');
    setCondicionIva(establishment.condicion_iva || 'monotributo');
    setPuntoVenta(String(establishment.punto_venta_afip || ''));
    setAfipEnvironment(establishment.afip_environment || 'testing');
    setInitialized(true);
  }

  const saveFiscalData = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('establishments')
        .update({
          cuit,
          razon_social: razonSocial,
          domicilio_comercial: domicilio,
          iibb: iibb || null,
          inicio_actividades: inicioActividades || null,
          condicion_iva: condicionIva,
          punto_venta_afip: puntoVenta ? parseInt(puntoVenta) : null,
          afip_environment: afipEnvironment,
        } as any)
        .eq('id', establishmentId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['establishment-fiscal'] });
      toast.success('Datos fiscales guardados');
    },
    onError: () => toast.error('Error al guardar datos fiscales'),
  });

  const uploadCertificate = useMutation({
    mutationFn: async ({ certFile, keyFile }: { certFile: File; keyFile: File | null }) => {
      const certText = (await certFile.text()).trim();
      const keyText = keyFile ? (await keyFile.text()).trim() : null;

      if (!certText.includes('BEGIN CERTIFICATE')) {
        throw new Error('El archivo no parece un certificado PEM válido (debe contener "BEGIN CERTIFICATE")');
      }
      if (keyText !== null && !keyText.includes('PRIVATE KEY')) {
        throw new Error('El archivo .key no parece una clave privada PEM válida');
      }


      // Upsert certificate (usamos el estado ya consultado por RPC)
      const existing = certRow;

      if (existing) {
        if (!keyText && !existing.hasKey) {
          throw new Error('Falta la clave privada');
        }
        const payload: any = { certificate_pem: certText };
        if (keyText) payload.private_key_pem = keyText;
        const { error } = await supabase
          .from('afip_certificates')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        if (!keyText) throw new Error('Falta la clave privada (.key)');
        const { error } = await supabase
          .from('afip_certificates')
          .insert({
            establishment_id: establishmentId!,
            certificate_pem: certText,
            private_key_pem: keyText,
          } as any);
        if (error) throw error;
      }

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['afip-certificate'] });
      toast.success('Certificado cargado correctamente');
    },
    onError: (e: any) => toast.error(e?.message || 'Error al cargar certificado'),
  });

  const [certFile, setCertFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [csrPem, setCsrPem] = useState<string | null>(null);

  const downloadTextFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  };

  const generateCsr = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('afip-csr', {
        body: { establishment_id: establishmentId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { csr: string; filename: string };
    },
    onSuccess: (data) => {
      setCsrPem(data.csr);
      queryClient.invalidateQueries({ queryKey: ['afip-certificate'] });
      downloadTextFile(data.csr, data.filename || 'datta.csr', 'application/pkcs10');
      toast.success('CSR generado y descargado');
    },
    onError: (e: any) => toast.error(e?.message || 'Error al generar el CSR'),
  });
  const downloadKey = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('afip-csr', {
        body: { action: 'download_key', establishment_id: establishmentId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.key) throw new Error('No se recibió la clave privada');
      return data as { key: string; filename: string };
    },
    onSuccess: (data) => {
      downloadTextFile(data.key, data.filename || 'datta.key', 'application/x-pem-file');
      toast.success('Clave privada descargada. Guardala en un lugar seguro.');
    },
    onError: (e: any) => toast.error(e?.message || 'Error al descargar la clave privada'),
  });


  const testConnection = useMutation({
    mutationFn: async () => {
      return await invokeAfip({ action: 'test', establishment_id: establishmentId });

    },
    onSuccess: (data) => {
      toast.success(`Conexión exitosa. Último comprobante: ${data.last_number ?? 'N/A'}`);
    },
    onError: (err: any) => toast.error(err.message || 'Error al probar conexión'),
  });

  return (
    <div className="space-y-6">
      {/* Fiscal data form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Datos fiscales del establecimiento
          </CardTitle>
          <CardDescription>
            Estos datos se incluirán en las facturas electrónicas emitidas por ARCA (AFIP).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cuit">CUIT</Label>
              <Input
                id="cuit"
                placeholder="20-12345678-9"
                value={cuit}
                onChange={e => setCuit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="razon-social">Razón Social</Label>
              <Input
                id="razon-social"
                placeholder="Mi Restaurante S.R.L."
                value={razonSocial}
                onChange={e => setRazonSocial(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="condicion-iva">Condición frente al IVA</Label>
              <Select value={condicionIva} onValueChange={setCondicionIva}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monotributo">Monotributista</SelectItem>
                  <SelectItem value="responsable_inscripto">Responsable Inscripto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="punto-venta">Punto de Venta AFIP</Label>
              <Input
                id="punto-venta"
                type="number"
                placeholder="1"
                value={puntoVenta}
                onChange={e => setPuntoVenta(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="domicilio">Domicilio Comercial</Label>
              <Input
                id="domicilio"
                placeholder="Av. Corrientes 1234, CABA"
                value={domicilio}
                onChange={e => setDomicilio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iibb">IIBB (opcional)</Label>
              <Input
                id="iibb"
                placeholder="Nro. inscripción"
                value={iibb}
                onChange={e => setIibb(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inicio-actividades">Inicio de actividades</Label>
              <Input
                id="inicio-actividades"
                type="date"
                value={inicioActividades}
                onChange={e => setInicioActividades(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ambiente AFIP</Label>
              <Select value={afipEnvironment} onValueChange={setAfipEnvironment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="testing">Testing (Homologación)</SelectItem>
                  <SelectItem value="production">Producción</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={() => saveFiscalData.mutate()} disabled={saveFiscalData.isPending} className="gap-2">
            {saveFiscalData.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar datos fiscales
          </Button>
        </CardContent>
      </Card>

      {/* CSR generation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileKey className="h-5 w-5" />
            Paso 1 — Generar CSR
          </CardTitle>
          <CardDescription>
            El CSR (pedido de certificado) se genera acá con tu CUIT y razón social. La clave privada queda
            guardada de forma segura en Datta y nunca se descarga.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
            <li>Guardá arriba el CUIT y la razón social.</li>
            <li>Generá y descargá el archivo .csr con el botón de abajo.</li>
            <li>
              En ARCA/AFIP entrá a <strong>Administración de Certificados Digitales</strong>, creá un alias
              (ej. <em>datta</em>) y subí el .csr.
            </li>
            <li>Descargá el certificado (.crt) que te devuelve ARCA y subilo en el Paso 2.</li>
            <li>
              Asociá el certificado al servicio <strong>wsfe</strong> (Facturación Electrónica) en
              Administrador de Relaciones.
            </li>
          </ol>

          <div className="flex flex-wrap gap-2">
            <Button
              className="gap-2"
              onClick={() => generateCsr.mutate()}
              disabled={generateCsr.isPending}
            >
              {generateCsr.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileKey className="h-4 w-4" />}
              Generar y descargar CSR
            </Button>
            {csrPem && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  navigator.clipboard.writeText(csrPem);
                  toast.success('CSR copiado');
                }}
              >
                Copiar CSR
              </Button>
            )}
            {certRow?.hasKey && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => downloadKey.mutate()}
                disabled={downloadKey.isPending}
              >
                {downloadKey.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileKey className="h-4 w-4" />}
                Descargar clave privada (.key)
              </Button>
            )}
          </div>


          {csrPem && (
            <textarea
              readOnly
              value={csrPem}
              rows={8}
              className="w-full text-[11px] font-mono rounded-md border border-border bg-muted p-2"
            />
          )}

          {certRow?.hasKey && !certRow.hasCert && (
            <p className="text-sm text-amber-600">
              Ya hay una clave privada generada esperando el certificado. Si volvés a generar el CSR, la clave
              anterior se reemplaza y el certificado que hayas pedido con ella deja de servir.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Certificate upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileKey className="h-5 w-5" />
            Paso 2 — Certificado digital AFIP
          </CardTitle>
          <CardDescription>
            Subí el certificado (.crt) que te dio ARCA. Si generaste el CSR desde acá, no hace falta la clave
            privada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasCertificate && (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Certificado cargado</span>
              {hasCertificate.expires_at && (
                <Badge variant="secondary" className="ml-auto">
                  Vence: {new Date(hasCertificate.expires_at).toLocaleDateString('es')}
                </Badge>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cert-file">Certificado (.crt / .pem)</Label>
              <Input
                id="cert-file"
                type="file"
                accept=".crt,.pem,.cer"
                onChange={e => setCertFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="key-file">
                Clave privada (.key) {certRow?.hasKey && <span className="text-muted-foreground">— opcional</span>}
              </Label>
              <Input
                id="key-file"
                type="file"
                accept=".key,.pem"
                onChange={e => setKeyFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                if (!certFile) {
                  toast.error('Seleccioná el certificado');
                  return;
                }
                if (!keyFile && !certRow?.hasKey) {
                  toast.error('Falta la clave privada (.key)');
                  return;
                }
                uploadCertificate.mutate({ certFile, keyFile });
              }}
              disabled={uploadCertificate.isPending || !certFile}
            >
              {uploadCertificate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Cargar certificado
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => testConnection.mutate()}
              disabled={testConnection.isPending || !hasCertificate}
            >
              {testConnection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Probar conexión
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
