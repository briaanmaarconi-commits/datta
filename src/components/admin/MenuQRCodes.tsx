import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Printer, ExternalLink } from 'lucide-react';

function usePublicOrigin() {
  const host = window.location.hostname;
  const isPreviewOrigin =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('id-preview--') ||
    host.endsWith('.lovableproject.com') ||
    host.endsWith('.lovable.dev') ||
    host.includes('sandbox');
  return isPreviewOrigin ? 'https://dattagestion.lovable.app' : window.location.origin;
}

function downloadQR(container: HTMLElement | null, filename: string) {
  const svg = container?.querySelector('svg');
  if (!svg) return;
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.onload = () => {
    const size = 1000;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${filename}.png`;
    a.click();
  };
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
}

export default function MenuQRCodes() {
  const { establishmentId } = useAuth();
  const publicOrigin = usePublicOrigin();
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  const cartaUrl = `${publicOrigin}/carta/${establishmentId}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">QR de la carta</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row items-center gap-6">
          <div ref={el => (refs.current['general'] = el)} className="bg-white p-5 rounded-lg">
            <QRCodeSVG value={cartaUrl} size={260} />
          </div>
          <div className="space-y-3 flex-1">
            <p className="text-sm text-muted-foreground">
              Un único QR para todo el salón: imprimilo una sola vez y pegá una copia en cada mesa.
            </p>
            <p className="text-sm text-muted-foreground">
              Esta dirección no cambia nunca. Si modificás platos o precios, la carta se actualiza sola y
              el QR impreso sigue funcionando.
            </p>
            <p className="text-xs break-all text-muted-foreground">{cartaUrl}</p>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="gap-2" onClick={() => downloadQR(refs.current['general'], 'qr-carta')}>
                <Download className="h-4 w-4" /> Descargar PNG
              </Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => window.open(cartaUrl, '_blank')}>
                <ExternalLink className="h-4 w-4" /> Abrir carta
              </Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Imprimir
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
