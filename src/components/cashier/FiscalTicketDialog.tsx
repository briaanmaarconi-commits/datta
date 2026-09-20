import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { printTicketPortal } from '@/lib/print';
import { downloadFacturaPdf } from '@/lib/facturaPdf';
import FacturaTicket80mm, {
  FacturaTicket80mmBody,
  FacturaTicketData,
  FacturaTicketEmisor,
} from './FacturaTicket80mm';


interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: FacturaTicketData | null;
  emisor: FacturaTicketEmisor;
}

/** Vista previa + impresión de una factura YA autorizada por ARCA. No emite nada. */
export default function FiscalTicketDialog({ open, onOpenChange, data, emisor }: Props) {
  const [printing, setPrinting] = useState<null | { reprint: boolean }>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!printing) return;

    // El efecto corre después de que React montó el portal. Dejamos además un
    // margen para que el canvas del QR se convierta en la imagen imprimible.
    return printTicketPortal(() => setPrinting(null), 700);
  }, [printing]);

  if (!data) return null;

  const doPrint = (reprint: boolean) => {
    setPrinting({ reprint });
  };

  const doDownload = async () => {
    setDownloading(true);
    try {
      await downloadFacturaPdf(data, emisor);
      toast.success('Factura descargada en PDF');
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo generar el PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista previa ticket 80 mm</DialogTitle>
          </DialogHeader>

          <div className="flex justify-center bg-white rounded-md py-2">
            <FacturaTicket80mmBody data={data} emisor={emisor} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button className="gap-2" onClick={() => doPrint(false)}>
              <Printer className="h-4 w-4" />
              Imprimir factura
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => doPrint(true)}>
              <Printer className="h-4 w-4" />
              Reimprimir
            </Button>
            <Button
              variant="secondary"
              className="gap-2 col-span-2"
              onClick={doDownload}
              disabled={downloading}
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Descargar PDF (A4)
            </Button>
          </div>

        </DialogContent>
      </Dialog>

      {printing && <FacturaTicket80mm data={data} emisor={emisor} reprint={printing.reprint} />}
    </>
  );
}
