import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { CheckCircle2, ChefHat, Download, ExternalLink, Printer, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { COMANDA_PRINTED_EVENT, COMANDA_TEST_EVENT } from '@/lib/comandaPrint';
import { directPrintLauncher } from '@/lib/printSetup';
import { useCashierComandas } from '@/hooks/useCashierComandas';

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children?: React.ReactNode }) {
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

function downloadShortcut() {
  const { filename, content } = directPrintLauncher('cashier');
  const url = URL.createObjectURL(new Blob([content], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Cómo dejar la comandera como impresora predeterminada de Windows (en vez de "Microsoft Print to PDF"). */
function DefaultPrinterHelp() {
  return (
    <div className="space-y-2">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Tocá <strong>Abrir impresoras de Windows</strong>.</li>
        <li><strong>Desactivá</strong> "Permitir que Windows administre la impresora predeterminada" (si no, Windows la cambia solo).</li>
        <li>Tocá la <strong>comandera</strong> (no "Microsoft Print to PDF", "OneNote" ni "Fax") y después <strong>Establecer como predeterminada</strong>.</li>
      </ol>
      <Button asChild variant="outline" size="sm" className="gap-2">
        <a href="ms-settings:printers"><ExternalLink className="h-4 w-4" />Abrir impresoras de Windows</a>
      </Button>
    </div>
  );
}

/** Cómo abrir Datta con impresión directa para que no aparezca el cuadro de "Imprimir". */
function DirectPrintHelp() {
  return (
    <div className="space-y-2">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Tocá <strong>Descargar acceso directo</strong> y abrí el archivo una vez (si Windows avisa, "Más información" → "Ejecutar de todas formas").</li>
        <li>Se crea el ícono <strong>"Datta Caja"</strong> en el escritorio. Desde ahora abrí Datta <strong>siempre</strong> con ese ícono.</li>
        <li>La primera vez vas a tener que iniciar sesión y volver a prender las comandas: Datta te lo va a recordar.</li>
      </ol>
      <Button size="sm" variant="outline" className="gap-2" onClick={downloadShortcut}><Download className="h-4 w-4" />Descargar acceso directo</Button>
    </div>
  );
}

type Answer = 'yes' | 'no' | null;

/** Activa, en ESTA PC de caja, la impresión automática de comandas por sector, con una guía paso a paso. */
export default function CashierComandaSettings() {
  const { establishmentId } = useAuth();
  const { on, setOn } = useCashierComandas();
  const [params] = useSearchParams();
  const fromBanner = params.get('guia') === 'comandas';
  const cardRef = useRef<HTMLDivElement>(null);
  const [tested, setTested] = useState(false);
  const [dialogSeen, setDialogSeen] = useState<boolean | null>(null);
  const [answer, setAnswer] = useState<Answer>(null);

  const { data: onlyDrinks = false } = useQuery({
    queryKey: ['comanda-only-drinks', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('establishments').select('drinks_print_at_cashier').eq('id', establishmentId!).maybeSingle();
      return !!(data as { drinks_print_at_cashier?: boolean } | null)?.drinks_print_at_cashier;
    },
    enabled: !!establishmentId,
  });

  useEffect(() => {
    if (fromBanner) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [fromBanner]);

  // Resultado de la impresión de prueba: si apareció el cuadro de "Imprimir".
  useEffect(() => {
    const onPrinted = (e: Event) => {
      if (!tested) return;
      setDialogSeen((prev) => prev || !!(e as CustomEvent<boolean>).detail);
    };
    window.addEventListener(COMANDA_PRINTED_EVENT, onPrinted);
    return () => window.removeEventListener(COMANDA_PRINTED_EVENT, onPrinted);
  }, [tested]);

  const turnOn = (v: boolean) => {
    void setOn(v);
    toast.success(v ? 'Las comandas se imprimirán solas en esta PC' : 'Impresión de comandas desactivada');
    if (!v) resetTest();
  };
  const runTest = () => {
    setTested(true);
    setDialogSeen(false);
    setAnswer(null);
    window.dispatchEvent(new Event(COMANDA_TEST_EVENT));
  };
  const resetTest = () => {
    setTested(false);
    setDialogSeen(null);
    setAnswer(null);
  };

  const allGood = answer === 'yes' && dialogSeen === false;
  const showGuide = fromBanner || !on || tested;

  return (
    <div ref={cardRef} className="scroll-mt-4">
      <Card className={cn(fromBanner && !allGood && 'ring-2 ring-primary')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><ChefHat className="h-5 w-5" /> Comandas en esta PC de caja</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {onlyDrinks && (
            <p className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
              En este local <strong>la caja imprime solo las comandas de bebidas</strong>; el resto sale por la comandera de
              cocina. Las bebidas son las categorías con sector <strong>Bebidas</strong> en Carta.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Cada vez que se toma un pedido se imprime acá, sola, <strong>una comanda por sector</strong> (fiambrería, plato
            principal, postre y bebida), por la impresora predeterminada de esta PC. La asignación de sector de cada
            categoría se hace en <strong>Carta</strong>.
          </p>

          {!showGuide && (
            <>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="cashier-comandas" className="text-sm">Imprimir comandas automáticamente en esta PC</Label>
                <Switch id="cashier-comandas" checked={on} onCheckedChange={turnOn} />
              </div>
              <Button variant="outline" className="gap-2" onClick={runTest}><Printer className="h-4 w-4" />Imprimir comandas de prueba</Button>
            </>
          )}

          {showGuide && (
            <div className="space-y-5 rounded-lg border bg-muted/30 p-4">
              <p className="text-sm font-medium">Seguí estos pasos en la computadora de la caja del local:</p>

              <Step n={1} title="Prendé las comandas en esta PC" done={on}>
                <div className="flex items-center justify-between rounded-lg border bg-background p-3">
                  <Label htmlFor="cashier-comandas" className="text-sm">Imprimir comandas automáticamente en esta PC</Label>
                  <Switch id="cashier-comandas" checked={on} onCheckedChange={turnOn} />
                </div>
                {!on && <p className="text-xs text-muted-foreground">Tocá el interruptor para prenderlo.</p>}
              </Step>

              <Step n={2} title="Imprimí una comanda de prueba" done={tested}>
                <Button size="sm" className="gap-2" onClick={runTest} disabled={!on}>
                  <Printer className="h-4 w-4" />{tested ? 'Imprimir otra vez' : 'Imprimir comanda de prueba'}
                </Button>
                {dialogSeen && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    Apareció el cuadro de <strong>Imprimir</strong>. En <strong>Destino</strong> elegí la <strong>comandera</strong>
                    {' '}(no "Microsoft Print to PDF": esa no imprime en papel, guarda un archivo) y tocá <strong>Imprimir</strong>.
                  </div>
                )}
              </Step>

              {tested && (
                <Step n={3} title="¿Salió la comanda en papel por la comandera?" done={allGood}>
                  {answer === null && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setAnswer('yes')}>Sí, salió</Button>
                      <Button size="sm" variant="outline" onClick={() => setAnswer('no')}>No salió</Button>
                    </div>
                  )}

                  {answer === 'yes' && !dialogSeen && (
                    <p className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />¡Listo! Las comandas van a salir solas. Dejá Datta abierto en esta PC mientras el local atiende.
                    </p>
                  )}

                  {answer === 'yes' && dialogSeen && (
                    <div className="space-y-4 text-sm">
                      <p>Bien, la comandera funciona. Falta que las comandas salgan <strong>solas</strong>, sin el cuadro de "Imprimir":</p>
                      <div className="space-y-2"><p className="font-medium">a) Dejá la comandera como impresora predeterminada</p><DefaultPrinterHelp /></div>
                      <div className="space-y-2"><p className="font-medium">b) Abrí Datta con impresión directa</p><DirectPrintHelp /></div>
                    </div>
                  )}

                  {answer === 'no' && (
                    <div className="space-y-4 text-sm">
                      <p>
                        Seguramente la impresora elegida no es la comandera (por ejemplo "Microsoft Print to PDF", que guarda
                        un archivo en vez de imprimir).
                      </p>
                      <div className="space-y-2"><p className="font-medium">a) Dejá la comandera como impresora predeterminada</p><DefaultPrinterHelp /></div>
                      <div className="space-y-1">
                        <p className="font-medium">b) Revisá la comandera</p>
                        <p>Que esté prendida, con papel y con el cable bien conectado.</p>
                      </div>
                      {dialogSeen && <div className="space-y-2"><p className="font-medium">c) Abrí Datta con impresión directa</p><DirectPrintHelp /></div>}
                    </div>
                  )}

                  {answer !== null && !allGood && (
                    <Button size="sm" variant="ghost" className="gap-2" onClick={runTest}><RotateCcw className="h-4 w-4" />Probar de nuevo</Button>
                  )}
                </Step>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            No lo prendas si entrás desde otra computadora (por ejemplo a distancia): esa compu se quedaría con las comandas
            y no saldrían en el local.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
