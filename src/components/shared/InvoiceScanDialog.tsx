import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { FileText, Loader2, ScanLine, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

export interface ParsedInvoiceItem {
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
}

export interface ParsedInvoice {
  supplier: string;
  invoice_number: string;
  invoice_date: string;
  total: number;
  items: ParsedInvoiceItem[];
  receipt_path?: string | null;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 10;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

const norm = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Junta lecturas que pertenecen a la misma factura (proveedor + número, o proveedor + fecha). */
function groupInvoices(list: ParsedInvoice[]): ParsedInvoice[] {
  const map = new Map<string, ParsedInvoice>();
  list.forEach((inv, idx) => {
    const key = norm(inv.supplier)
      ? `${norm(inv.supplier)}|${norm(inv.invoice_number) || norm(inv.invoice_date)}`
      : `__solo_${idx}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...inv, items: [...inv.items] });
      return;
    }
    prev.items = [...prev.items, ...inv.items];
    prev.total = Math.max(Number(prev.total) || 0, Number(inv.total) || 0);
    if (!prev.invoice_number && inv.invoice_number) prev.invoice_number = inv.invoice_number;
    if (!prev.invoice_date && inv.invoice_date) prev.invoice_date = inv.invoice_date;
    if (!prev.receipt_path && inv.receipt_path) prev.receipt_path = inv.receipt_path;
  });
  return Array.from(map.values());
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Se llama con las facturas leídas (ya agrupadas) para revisarlas antes de guardar. */
  onParsed: (invoices: ParsedInvoice[]) => void;
}

export default function InvoiceScanDialog({ open, onOpenChange, onParsed }: Props) {
  const { establishmentId } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    const urls: Record<string, string> = {};
    files.forEach(f => {
      if (f.type.startsWith('image/')) urls[`${f.name}-${f.size}`] = URL.createObjectURL(f);
    });
    setPreviews(urls);
    return () => Object.values(urls).forEach(u => URL.revokeObjectURL(u));
  }, [files]);

  const reset = () => { setFiles([]); setLoading(false); setDone(0); };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const tooBig = incoming.find(f => f.size > MAX_BYTES);
    if (tooBig) toast.error(`"${tooBig.name}" supera los 15 MB y se omitió`);
    const ok = incoming.filter(f => f.size <= MAX_BYTES);
    setFiles(prev => {
      const merged = [...prev];
      ok.forEach(f => {
        if (!merged.some(m => m.name === f.name && m.size === f.size)) merged.push(f);
      });
      if (merged.length > MAX_FILES) toast.error(`Máximo ${MAX_FILES} archivos por lectura`);
      return merged.slice(0, MAX_FILES);
    });
  };

  const parseOne = async (file: File): Promise<ParsedInvoice> => {
    const dataUrl = await toBase64(file);
    const { data, error } = await supabase.functions.invoke('parse-invoice', {
      body: { fileData: dataUrl, mimeType: file.type, filename: file.name },
    });

    if (error) {
      let msg = 'No se pudo leer la factura';
      const ctx = (error as any)?.context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const payload = await ctx.clone().json();
          if (payload?.error) msg = payload.error;
        } catch { /* sin body legible */ }
      }
      throw new Error(msg);
    }
    if ((data as any)?.error) throw new Error((data as any).error);

    let receipt_path: string | null = null;
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${establishmentId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('purchase-receipts').upload(path, file, {
        contentType: file.type,
      });
      if (!upErr) receipt_path = path;
    } catch { /* opcional */ }

    return { ...(data as ParsedInvoice), receipt_path };
  };

  const handleScan = async () => {
    if (!files.length) return;
    setLoading(true);
    setDone(0);
    const results: ParsedInvoice[] = [];
    const failed: string[] = [];

    for (const file of files) {
      try {
        results.push(await parseOne(file));
      } catch (e: any) {
        failed.push(`${file.name}: ${e?.message || 'no se pudo leer'}`);
      } finally {
        setDone(d => d + 1);
      }
    }

    setLoading(false);

    if (!results.length) {
      toast.error(failed[0] || 'No se pudo leer ningún archivo');
      return;
    }
    if (failed.length) toast.warning(`${failed.length} archivo(s) no se pudieron leer`);

    const grouped = groupInvoices(results);
    onParsed(grouped);
    toast.success(
      grouped.length === 1
        ? 'Factura leída. Revisá los datos antes de guardar.'
        : `${grouped.length} facturas leídas. Revisá los datos antes de guardar.`
    );
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5" /> Leer facturas con IA</DialogTitle>
          <DialogDescription>
            Subí una o varias fotos (JPG/PNG) o PDFs de varias páginas. Podés cargar las hojas de una misma factura o varias facturas juntas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
          <Button variant="outline" className="w-full" onClick={() => inputRef.current?.click()} disabled={loading}>
            <Upload className="h-4 w-4 mr-2" /> {files.length ? 'Agregar más archivos' : 'Elegir archivos'}
          </Button>

          {files.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {files.map((f) => {
                const key = `${f.name}-${f.size}`;
                const url = previews[key];
                return (
                  <div key={key} className="relative rounded-md border bg-muted/40 overflow-hidden aspect-square">
                    {url ? (
                      <img src={url} alt={f.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex flex-col items-center justify-center gap-1 p-1">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground truncate w-full text-center">{f.name}</span>
                      </div>
                    )}
                    {!loading && (
                      <button
                        type="button"
                        aria-label={`Quitar ${f.name}`}
                        onClick={() => setFiles(prev => prev.filter(p => `${p.name}-${p.size}` !== key))}
                        className="absolute top-1 right-1 rounded-full bg-background/90 border p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {loading && (
            <div className="space-y-1">
              <Progress value={(done / files.length) * 100} />
              <p className="text-xs text-muted-foreground text-center">Leyendo {Math.min(done + 1, files.length)} de {files.length}...</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleScan} disabled={!files.length || loading}>
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Leyendo...</> : <>Leer {files.length > 1 ? `${files.length} archivos` : 'factura'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
