import { format } from 'date-fns';
import { formatShiftDate, formatShiftRange } from '@/lib/shiftScope';

export interface ShiftReportData {
  establishmentName?: string;
  shiftDate: string;
  openedAt?: string | null;
  closedAt?: string | null;
  closedByName?: string | null;
  totalSales: number;
  closedOrders: number;
  avgTicket: number;
  cash: number;
  card: number;
  transfer: number;
  initialCash: number;
  cashIncome: number;
  cashExpenses: number;
  expectedCash: number;
  actualCash: number;
  tips: number;
  fiscalCount: number;
  courtesyTotal?: number;
  courtesyCount?: number;
  courtesyByPerson?: { name: string; amount: number; count: number }[];
  anomalies?: {
    action: string;
    tableNumber?: number | null;
    reason?: string | null;
    amount: number;
    itemsCount: number;
    time: string;
  }[];
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

export function ShiftReportBody({ data, reprint }: { data: ShiftReportData; reprint?: boolean }) {
  const diff = data.actualCash - data.expectedCash;
  const diffLabel =
    Math.abs(diff) < 0.01 ? 'CAJA OK' : diff > 0 ? 'SOBRANTE' : 'FALTANTE';

  return (
    <div>
      <div className="text-center mb-2">
        <p className="font-bold text-base">{data.establishmentName || 'Establecimiento'}</p>
        <p className="font-bold text-sm border-y border-dashed border-foreground py-0.5 my-1">
          CIERRE DE TURNO
        </p>
        {reprint && <p className="text-xs font-bold">*** REIMPRESIÓN ***</p>}
        <p className="text-xs">
          Fecha del turno: {formatShiftDate({ shift_date: data.shiftDate, opened_at: data.openedAt })}
        </p>
        <p className="text-xs">
          Horario: {formatShiftRange({ opened_at: data.openedAt, closed_at: data.closedAt })}
        </p>
        {data.closedByName && <p className="text-xs">Cierra: {data.closedByName}</p>}
      </div>

      <div className="border-t border-dashed border-foreground my-1" />

      <p className="text-xs font-bold">VENTAS DEL TURNO</p>
      <div className="text-xs space-y-0.5">
        <Row label="Total ventas" value={fmt(data.totalSales)} bold />
        <Row label="Pedidos cerrados" value={String(data.closedOrders)} />
        <Row label="Ticket promedio" value={fmt(data.avgTicket)} />
      </div>

      <div className="border-t border-dashed border-foreground my-1" />

      <p className="text-xs font-bold">MÉTODOS DE PAGO</p>
      <div className="text-xs space-y-0.5">
        <Row label="Efectivo" value={fmt(data.cash)} />
        <Row label="Tarjeta" value={fmt(data.card)} />
        <Row label="Transferencia" value={fmt(data.transfer)} />
      </div>

      <div className="border-t border-dashed border-foreground my-1" />

      <p className="text-xs font-bold">ARQUEO DE CAJA</p>
      <div className="text-xs space-y-0.5">
        <Row label="Fondo inicial" value={fmt(data.initialCash)} />
        <Row label="+ Ingresos efectivo" value={fmt(data.cashIncome)} />
        <Row label="- Egresos efectivo" value={fmt(data.cashExpenses)} />
        <Row label="= Efectivo esperado" value={fmt(data.expectedCash)} bold />
        <Row label="Efectivo contado" value={fmt(data.actualCash)} bold />
      </div>

      <div className="border-t border-dashed border-foreground my-1" />
      <div className="text-center text-sm font-bold py-1">
        <p>{diffLabel}</p>
        {Math.abs(diff) >= 0.01 && <p>{fmt(Math.abs(diff))}</p>}
      </div>
      <div className="border-t border-dashed border-foreground my-1" />

      <div className="text-xs space-y-0.5">
        <Row label="Propinas del turno" value={fmt(data.tips)} />
        <p className="text-[10px]">(informativo, no afecta el arqueo)</p>
        {data.fiscalCount > 0 && (
          <Row label="Facturas fiscales" value={String(data.fiscalCount)} />
        )}
      </div>

      {(data.courtesyCount ?? 0) > 0 && (
        <>
          <div className="border-t border-dashed border-foreground my-1" />
          <p className="text-xs font-bold">CORTESÍAS / INVITACIONES</p>
          <div className="text-xs space-y-0.5">
            <Row label={`Cortesías (${data.courtesyCount})`} value={fmt(data.courtesyTotal ?? 0)} bold />
            {(data.courtesyByPerson ?? []).map(p => (
              <Row key={p.name} label={`  ${p.name} (${p.count})`} value={fmt(p.amount)} />
            ))}
            <p className="text-[10px]">(no cobrado, no afecta el arqueo)</p>
          </div>
        </>
      )}


      {(data.anomalies?.length ?? 0) > 0 && (
        <>
          <div className="border-t border-dashed border-foreground my-1" />
          <p className="text-xs font-bold">CONTROL / ANOMALÍAS</p>
          <div className="text-xs space-y-0.5">
            {data.anomalies!.map((a, i) => (
              <div key={i}>
                <div className="flex justify-between">
                  <span>
                    {format(new Date(a.time), 'HH:mm')}{' '}
                    {a.action === 'close_table_zero'
                      ? 'Mesa en $0'
                      : a.action === 'close_table_excluded_items'
                        ? 'Ítems excluidos'
                        : 'Ítem eliminado'}
                    {a.tableNumber ? ` (M${a.tableNumber})` : ''}
                  </span>
                  <span>{a.amount ? fmt(a.amount) : ''}</span>
                </div>
                {a.reason && <p className="text-[10px]">  Motivo: {a.reason}</p>}
              </div>
            ))}
            <p className="text-[10px]">(revisar con el encargado)</p>
          </div>
        </>
      )}

      <div className="border-t border-dashed border-foreground my-2" />

      <p className="text-[10px] mt-3">Firma responsable: __________________</p>
      <p className="text-[10px] mt-1">Obs.: _______________________________</p>
      <p className="text-center text-[10px] mt-2">*** DOCUMENTO NO FISCAL ***</p>
    </div>
  );
}

/** Print-only area for the 80mm shift close report. */
export default function ShiftReportTicket({
  data,
  reprint,
}: {
  data: ShiftReportData;
  reprint?: boolean;
}) {
  return (
    <div className="hidden print:block print-ticket">
      <ShiftReportBody data={data} reprint={reprint} />
    </div>
  );
}
