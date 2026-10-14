import { Headset, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

// Página oficial de descarga de AnyDesk. No alojamos el instalador: siempre se baja de la fuente oficial.
export const ANYDESK_DOWNLOAD_URL = 'https://anydesk.com/es/downloads';

/**
 * Acceso para soporte remoto: el restaurante descarga AnyDesk y le pasa al equipo de Datta
 * el número de ID que muestra la aplicación.
 */
export default function RemoteSupportButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Headset className="h-4 w-4" />
          <span className="hidden sm:inline">Soporte remoto</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Soporte remoto</DialogTitle>
          <DialogDescription>
            Si necesitás que el equipo de Datta resuelva un problema desde su computadora, instalá AnyDesk.
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Descargá AnyDesk desde el botón de abajo e instalalo.</li>
          <li>Abrilo y copiá el número de <strong>ID</strong> que aparece en pantalla.</li>
          <li>Pasale ese número al equipo de Datta para que se conecte.</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Aceptá la conexión solo si el pedido de acceso viene del equipo de Datta.
        </p>
        <Button asChild className="w-full gap-2">
          <a href={ANYDESK_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
            Descargar AnyDesk <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
