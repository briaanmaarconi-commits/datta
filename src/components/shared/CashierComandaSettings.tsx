import { useEffect, useState } from 'react';
import { ChefHat } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { COMANDA_PRINT_EVENT, COMANDA_TEST_EVENT, isCashierComandaPrintOn, setCashierComandaPrint } from '@/lib/comandaPrint';

/** Activa, en ESTA PC de caja, la impresión automática de comandas por sector (local con una sola PC). */
export default function CashierComandaSettings() {
  const { establishmentId } = useAuth();
  const [on, setOn] = useState(() => isCashierComandaPrintOn(establishmentId));

  useEffect(() => {
    const read = () => setOn(isCashierComandaPrintOn(establishmentId));
    read();
    window.addEventListener(COMANDA_PRINT_EVENT, read);
    return () => window.removeEventListener(COMANDA_PRINT_EVENT, read);
  }, [establishmentId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><ChefHat className="h-5 w-5" /> Comandas en esta PC de caja</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Cada vez que se toma un pedido se imprime acá, sola, <strong>una comanda por sector</strong> (fiambrería, plato
          principal, postre y bebida), por la impresora predeterminada de esta PC. Sirve cuando el local tiene una sola
          computadora. La asignación de sector de cada categoría se hace en <strong>Carta</strong>.
        </p>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label htmlFor="cashier-comandas" className="text-sm">Imprimir comandas automáticamente en esta PC</Label>
          <Switch
            id="cashier-comandas"
            checked={on}
            onCheckedChange={(v) => {
              setCashierComandaPrint(establishmentId, v);
              setOn(v);
              toast.success(v ? 'Las comandas se imprimirán solas en esta PC' : 'Impresión de comandas desactivada');
            }}
          />
        </div>
        <Button variant="outline" onClick={() => window.dispatchEvent(new Event(COMANDA_TEST_EVENT))}>
          Imprimir comandas de prueba
        </Button>
        <p className="text-xs text-muted-foreground">
          Para que no aparezca el cuadro de impresión, usá el acceso directo con impresión directa (más abajo, en la
          configuración de esta PC). Dejá esta PC con Datta abierta mientras el local atiende.
        </p>
      </CardContent>
    </Card>
  );
}
