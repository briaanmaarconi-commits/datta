import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChefHat, Download, ExternalLink, Printer, Receipt, Store, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ROLE_LABEL, directPrintLauncher, getPrintSetup, printAndDetectDialog, savePrintSetup,
  type PaperWidth, type PrintRole, type PrintSetup,
} from '@/lib/printSetup';

const ROLES: { id: PrintRole; title: string; text: string; icon: typeof ChefHat }[] = [
  { id: 'kitchen', title: 'Cocina', text: 'Comandas de los pedidos', icon: ChefHat },
  { id: 'cashier', title: 'Caja', text: 'Precuentas, comprobantes y cierres', icon: Receipt },
  { id: 'both', title: 'Las dos', text: 'Una sola PC e impresora para todo', icon: Store },
];

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      {done
        ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
        : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-semibold">{n}</span>}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-semibold">{title}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * Configuración guiada de la impresora de ESTA computadora. El navegador imprime siempre en la
 * impresora predeterminada de Windows: acá se elige qué imprime la PC, el papel, se prueba y se crea
 * el acceso directo con impresión directa (sin cuadro de diálogo).
 */
export default function PrinterSetup() {
  const [setup, setSetup] = useState<PrintSetup>(getPrintSetup);
  const [printing, setPrinting] = useState(false);
  const update = (patch: Partial<PrintSetup>) => setSetup(prev => {
    const next = { ...prev, ...patch };
    savePrintSetup(next);
    return next;
  });

  function testPrint() {
    setPrinting(true);
    // Se espera un instante a que el ticket de prueba esté en pantalla antes de imprimir.
    setTimeout(() => {
      document.body.classList.add('printing-ticket');
      const dialog = printAndDetectDialog();
      document.body.classList.remove('printing-ticket');
      setPrinting(false);
      update({ directPrint: !dialog, testedAt: new Date().toISOString() });
      if (dialog) toast.info('Apareció el cuadro de impresión: hacé el paso 5 para que salga directo.');
      else toast.success('Salió directo, sin cuadro de impresión.');
    }, 300);
  }

  function downloadLauncher() {
    const { filename, content } = directPrintLauncher(setup.role);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const now = new Date();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5" />Impresora de esta computadora</CardTitle>
          <p className="text-sm text-muted-foreground">
            Datta imprime en la <strong>impresora predeterminada de Windows</strong> de cada PC (el navegador no puede elegir otra).
            Hacé estos pasos una vez en cada computadora que imprime.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <Step n={1} title="¿Qué imprime esta PC?" done>
            <div className="grid gap-2 sm:grid-cols-3">
              {ROLES.map(r => (
                <button
                  key={r.id} type="button" onClick={() => update({ role: r.id })}
                  className={cn('flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50', setup.role === r.id && 'border-primary bg-primary/5 ring-1 ring-primary')}
                >
                  <r.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span><span className="block font-medium">{r.title}</span><span className="text-xs text-muted-foreground">{r.text}</span></span>
                </button>
              ))}
            </div>
          </Step>

          <Step n={2} title="Dejá la impresora térmica como predeterminada">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Conectá y encendé la impresora (si la instalaste con su CD o driver, mejor).</li>
              <li>Abrí <strong>Impresoras y escáneres</strong> de Windows con el botón de abajo.</li>
              <li><strong>Desactivá</strong> "Permitir que Windows administre la impresora predeterminada" (si no, Windows la cambia solo y deja de imprimir donde debe).</li>
              <li>Entrá a la impresora térmica y tocá <strong>Establecer como predeterminada</strong>.</li>
            </ol>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href="ms-settings:printers"><ExternalLink className="h-4 w-4" />Abrir impresoras de Windows</a>
            </Button>
          </Step>

          <Step n={3} title="Ancho del papel" done>
            <div className="flex gap-2">
              {([80, 58] as PaperWidth[]).map(p => (
                <Button key={p} type="button" variant={setup.paper === p ? 'default' : 'outline'} size="sm" onClick={() => update({ paper: p })}>
                  {p} mm{p === 80 ? ' (el más común)' : ''}
                </Button>
              ))}
            </div>
          </Step>

          <Step n={4} title="Imprimí una prueba" done={setup.directPrint !== null}>
            <Button size="sm" className="gap-2" onClick={testPrint} disabled={printing}><Printer className="h-4 w-4" />Imprimir prueba</Button>
            {setup.directPrint === true && (
              <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />Impresión directa activa: los tickets salen solos.</p>
            )}
            {setup.directPrint === false && (
              <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400"><XCircle className="h-4 w-4" />Apareció el cuadro de impresión. Si el ticket salió bien, hacé el paso 5 para que no vuelva a aparecer.</p>
            )}
            <p className="text-xs text-muted-foreground">Si no salió o salió en otra impresora, revisá el paso 2. Si salió cortado o muy chico, cambiá el ancho del papel.</p>
          </Step>

          <Step n={5} title="Impresión directa, sin cuadro de diálogo" done={setup.directPrint === true}>
            <p className="text-sm text-muted-foreground">
              Descargá este archivo y abrilo <strong>una sola vez</strong>: crea en el escritorio el ícono
              <strong> "Datta {ROLE_LABEL[setup.role]}"</strong>. Desde ahí, Datta imprime directo en la impresora predeterminada.
              La primera vez que lo abras vas a tener que iniciar sesión.
            </p>
            <Button size="sm" variant="outline" className="gap-2" onClick={downloadLauncher}><Download className="h-4 w-4" />Descargar acceso directo (Windows)</Button>
            <p className="text-xs text-muted-foreground">
              Si Windows avisa que el archivo "podría ser peligroso", elegí "Más información" → "Ejecutar de todas formas". Después abrí Datta con el ícono nuevo y repetí la prueba del paso 4.
            </p>
          </Step>
        </CardContent>
      </Card>

      {printing && createPortal(
        <div className="print-portal">
          <div className="print-ticket" style={{ fontFamily: 'Arial, sans-serif', color: '#000' }}>
            <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 16 }}>DATTA</div>
            <div style={{ textAlign: 'center' }}>Prueba de impresión</div>
            <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />
            <div>PC: {ROLE_LABEL[setup.role]}</div>
            <div>Papel: {setup.paper} mm</div>
            <div>{now.toLocaleString('es-AR')}</div>
            <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />
            <div style={{ fontFamily: 'Courier New, monospace', wordBreak: 'break-all' }}>{'1234567890'.repeat(setup.paper === 80 ? 5 : 4)}</div>
            <div style={{ textAlign: 'center', marginTop: '2mm' }}>Si esta línea entra completa, el ancho está bien.</div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
