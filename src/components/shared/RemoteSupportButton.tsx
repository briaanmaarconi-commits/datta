import { useEffect, useRef, useState } from 'react';
import { Headset, ExternalLink, Loader2, MonitorUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

// Página oficial de descarga de AnyDesk. No alojamos el instalador: siempre se baja de la fuente oficial.
export const ANYDESK_DOWNLOAD_URL = 'https://anydesk.com/es/downloads';
// AnyDesk instalado registra el protocolo "anydesk:": abrirlo levanta la app, que muestra el número de esta PC.
const ANYDESK_APP_URL = 'anydesk:';
// Esta PC ya abrió AnyDesk desde Datta alguna vez: no se le ofrece descargarlo primero.
const INSTALLED_KEY = 'datta.anydeskInstalled';
// Tiempo para que la persona confirme el aviso del navegador ("¿Abrir AnyDesk?") y la app tome el foco.
const OPEN_TIMEOUT_MS = 10_000;

type Status = 'idle' | 'opening' | 'opened' | 'missing';

function knownInstalled() {
  try {
    return localStorage.getItem(INSTALLED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Soporte remoto: abre AnyDesk en esta PC para que el restaurante le pase al equipo de Datta el número que muestra
 * la app. Si AnyDesk no está instalado (la app no se abre), ofrece descargarlo de la página oficial.
 */
export default function RemoteSupportButton() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const cleanupRef = useRef<() => void>(() => undefined);

  useEffect(() => () => cleanupRef.current(), []);

  const openAnyDesk = () => {
    cleanupRef.current();
    setStatus('opening');
    // Si AnyDesk se abre, la ventana del navegador pierde el foco: así se sabe que está instalado.
    const onBlur = () => {
      done();
      try {
        localStorage.setItem(INSTALLED_KEY, '1');
      } catch {
        /* sin almacenamiento: la próxima vez vuelve a probar igual */
      }
      setStatus('opened');
    };
    const timer = window.setTimeout(() => {
      done();
      setStatus('missing');
    }, OPEN_TIMEOUT_MS);
    const done = () => {
      window.clearTimeout(timer);
      window.removeEventListener('blur', onBlur);
    };
    cleanupRef.current = done;
    window.addEventListener('blur', onBlur);
    window.location.href = ANYDESK_APP_URL;
  };

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) openAnyDesk();
    else {
      cleanupRef.current();
      setStatus('idle');
    }
  };

  const showDownload = status === 'missing' || (status === 'opening' && !knownInstalled());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => onOpenChange(true)}>
        <Headset className="h-4 w-4" />
        <span className="hidden sm:inline">Soporte remoto</span>
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Soporte remoto</DialogTitle>
          <DialogDescription>
            Para que el equipo de Datta se conecte a esta computadora, pasale el número que muestra AnyDesk.
          </DialogDescription>
        </DialogHeader>

        {status === 'opening' && (
          <p className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            Abriendo AnyDesk… Si el navegador pregunta, tocá <strong>Abrir AnyDesk</strong>.
          </p>
        )}

        {status !== 'missing' && (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>En AnyDesk, buscá el número de <strong>esta computadora</strong> (arriba a la izquierda, "Tu dirección" o "Este puesto de trabajo").</li>
            <li>Pasale ese número al equipo de Datta.</li>
            <li>Cuando aparezca el pedido de conexión, tocá <strong>Aceptar</strong>.</li>
          </ol>
        )}

        {status === 'missing' && (
          <div className="space-y-2 text-sm">
            <p>Parece que AnyDesk no está instalado en esta computadora.</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Descargalo con el botón de abajo e instalalo.</li>
              <li>Abrilo y pasale al equipo de Datta el número de esta computadora.</li>
            </ol>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Aceptá la conexión solo si el pedido de acceso viene del equipo de Datta.
        </p>

        <div className="flex flex-col gap-2">
          {status !== 'opening' && status !== 'missing' && (
            <Button variant="outline" className="w-full gap-2" onClick={openAnyDesk}>
              <MonitorUp className="h-4 w-4" />Abrir AnyDesk otra vez
            </Button>
          )}
          {status === 'missing' && (
            <Button variant="outline" className="w-full gap-2" onClick={openAnyDesk}>
              <MonitorUp className="h-4 w-4" />Ya lo tengo: abrir AnyDesk
            </Button>
          )}
          {showDownload ? (
            <Button asChild className="w-full gap-2">
              <a href={ANYDESK_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" onClick={() => cleanupRef.current()}>
                Descargar AnyDesk <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          ) : (
            <a href={ANYDESK_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" onClick={() => cleanupRef.current()} className="text-center text-xs text-muted-foreground underline">
              ¿No tenés AnyDesk? Descargalo
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
