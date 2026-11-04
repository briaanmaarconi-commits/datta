import { useLocation, useNavigate } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCashierComandas } from '@/hooks/useCashierComandas';
import { COMANDA_GUIDE_PATH } from '@/lib/comandaPrint';

/**
 * Aviso en la caja: el local imprime las comandas por caja pero en este navegador están apagadas (se borraron los
 * datos, se abrió Datta desde otro acceso directo o es otra compu). "Prender comandas" lleva a la guía en Impresoras.
 */
export default function ComandaOffBanner() {
  const { showWarning, setOn } = useCashierComandas();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // En Impresoras ya está la guía: no se repite el aviso.
  if (!showWarning || pathname.startsWith('/cashier/impresoras')) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
      <Printer className="h-5 w-5 shrink-0" />
      <p className="min-w-0 flex-1">
        <strong>Las comandas no se están imprimiendo en esta PC.</strong> Si esta es la caja del local, prendelas.
        Si estás en otra computadora, tocá "No es la caja".
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => navigate(COMANDA_GUIDE_PATH)}>Prender comandas</Button>
        <Button size="sm" variant="outline" onClick={() => void setOn(false)}>No es la caja</Button>
      </div>
    </div>
  );
}
