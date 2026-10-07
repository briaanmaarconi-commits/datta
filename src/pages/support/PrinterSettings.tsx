import PrinterSetup from '@/components/shared/PrinterSetup';

/** Impresoras (admin y caja): configuración guiada de la impresora de esta computadora. */
export default function PrinterSettings() {
  return (
    <div className="max-w-4xl space-y-6 pb-28 lg:pb-0">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Impresoras</h1>
        <p className="mt-1 text-muted-foreground">Configurá la impresora de cada computadora del local. En la PC de cocina, entrá desde la pantalla de Cocina → Configurar impresora.</p>
      </div>
      <PrinterSetup />
    </div>
  );
}
