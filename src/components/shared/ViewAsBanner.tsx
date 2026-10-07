import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { setOperate, VIEW_LABEL, type ViewRole } from '@/lib/viewAs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** Deja registrado en la auditoría del local que el superadmin entró (o activó/desactivó «Operar»). */
function logViewAs(establishmentId: string, role: ViewRole, mode: 'spectate' | 'operate') {
  void fetch('/api/auth/view-as', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ establishment_id: establishmentId, role, mode }),
  }).catch(() => undefined);
}

/**
 * Cartel fijo de las pestañas "ver como" del superadmin: avisa qué local y rol se está viendo, si es solo lectura o
 * si se puede modificar, y permite activar «Operar» (con confirmación) o cerrar la vista. No se muestra a nadie más.
 */
export default function ViewAsBanner() {
  const { viewAs, exitViewAs } = useAuth();
  const qc = useQueryClient();
  const [confirmOperate, setConfirmOperate] = useState(false);

  // Una vez por pestaña y local/rol: queda constancia de la entrada.
  useEffect(() => {
    if (!viewAs) return;
    const key = `datta-view-as-logged-${viewAs.establishmentId}-${viewAs.role}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      /* sin sessionStorage: se registra igual */
    }
    logViewAs(viewAs.establishmentId, viewAs.role, 'spectate');
  }, [viewAs?.establishmentId, viewAs?.role]);

  if (!viewAs) return null;

  const switchTo = (operate: boolean) => {
    setOperate(operate);
    logViewAs(viewAs.establishmentId, viewAs.role, operate ? 'operate' : 'spectate');
    void qc.invalidateQueries();
  };

  return (
    <>
      <div
        role="status"
        className={`sticky top-0 z-[60] flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm font-medium text-white ${viewAs.operate ? 'bg-red-600' : 'bg-sky-700'}`}
      >
        {viewAs.operate ? <ShieldAlert className="h-4 w-4 shrink-0" /> : <Eye className="h-4 w-4 shrink-0" />}
        <span className="flex-1">
          Viendo <strong>{viewAs.name || 'el local'}</strong> como <strong>{VIEW_LABEL[viewAs.role]}</strong>
          {' · '}
          {viewAs.operate ? 'MODO OPERAR: lo que hagas modifica los datos reales' : 'SOLO MIRAR: no se puede modificar nada'}
        </span>
        <label className="flex cursor-pointer items-center gap-2">
          <span>Operar</span>
          <Switch
            checked={viewAs.operate}
            onCheckedChange={(v) => (v ? setConfirmOperate(true) : switchTo(false))}
            aria-label="Activar modo operar"
          />
        </label>
        <Button size="sm" variant="secondary" className="h-7 gap-1" onClick={exitViewAs}>
          <X className="h-3.5 w-3.5" /> Cerrar vista
        </Button>
      </div>

      <AlertDialog open={confirmOperate} onOpenChange={setConfirmOperate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Operar en {viewAs.name || 'este local'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a poder cobrar, cargar pedidos y modificar datos como lo haría {VIEW_LABEL[viewAs.role].toLowerCase()}. Los cambios son <strong>reales</strong> y quedan
              registrados a tu nombre en la auditoría del local.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir mirando</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                setConfirmOperate(false);
                switchTo(true);
              }}
            >
              Sí, operar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
