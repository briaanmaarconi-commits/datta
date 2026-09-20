import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Ticket fiscal 80mm para comandera térmica.
 * SOLO renderiza datos de una factura YA AUTORIZADA por ARCA.
 * No emite, no pide CAE, no toca la integración fiscal.
 */

export interface FacturaTicketEmisor {
  nombre?: string | null;          // nombre comercial
  razon_social?: string | null;
  cuit?: string | null;
  domicilio?: string | null;
  condicion_iva?: string | null;
}

export interface FacturaTicketItem {
  name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

export interface FacturaTicketData {
  tipo_cbte: number;
  punto_venta: number;
  cbte_numero: number;
  cae: string;
  cae_vto: string;            // yyyymmdd o ISO
  created_at: string;
  total: number;
  neto_gravado?: number | null;
  iva_amount?: number | null;
  discount?: number | null;
  payment_method?: string | null;
  receptor_cuit?: string | null;
  receptor_razon_social?: string | null;
  receptor_condicion_iva?: string | null;
  is_credit_note?: boolean;
  items: FacturaTicketItem[];
}

const TIPO_LABELS: Record<number, string> = {
  1: 'FACTURA A',
  3: 'NOTA DE CRÉDITO A',
  6: 'FACTURA B',
  8: 'NOTA DE CRÉDITO B',
  11: 'FACTURA C',
  13: 'NOTA DE CRÉDITO C',
};

const CONDICION_LABELS: Record<string, string> = {
  consumidor_final: 'Consumidor Final',
  responsable_inscripto: 'Responsable Inscripto',
  monotributo: 'Monotributista',
  exento: 'Exento',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'EFECTIVO',
  card: 'TARJETA',
  transfer: 'TRANSFERENCIA',
};

const money = (n: number) =>
  '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const onlyDigits = (s?: string | null) => (s || '').replace(/\D/g, '');

function parseCaeVto(v?: string): Date | null {
  if (!v) return null;
  if (/^\d{8}$/.test(v)) {
    return new Date(Number(v.slice(0, 4)), Number(v.slice(4, 6)) - 1, Number(v.slice(6, 8)));
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(d?: Date | null) {
  return d ? format(d, 'dd/MM/yyyy', { locale: es }) : '-';
}

/** URL oficial del QR de ARCA (RG 4892) construida con los datos del comprobante autorizado. */
export function buildArcaQrUrl(data: FacturaTicketData, emisorCuit?: string | null): string | null {
  const cuit = onlyDigits(emisorCuit);
  if (!cuit || !data.cae) return null;
  const receptorCuit = onlyDigits(data.receptor_cuit);
  const payload = {
    ver: 1,
    fecha: format(new Date(data.created_at), 'yyyy-MM-dd'),
    cuit: Number(cuit),
    ptoVta: data.punto_venta,
    tipoCmp: data.tipo_cbte,
    nroCmp: data.cbte_numero,
    importe: Number(Number(data.total).toFixed(2)),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: receptorCuit ? 80 : 99,
    nroDocRec: receptorCuit ? Number(receptorCuit) : 0,
    tipoCodAut: 'E',
    codAut: Number(data.cae),
  };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
}

function Sep() {
  return <div className="ft-sep" />;
}

/**
 * QR renderizado como imagen PNG (data URL).
 * Las comanderas térmicas y varios drivers de impresión omiten el <svg>,
 * por eso generamos el canvas fuera de pantalla y lo imprimimos como <img>.
 */
function ArcaQr({ value }: { value: string }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [png, setPng] = useState<string | null>(null);

  useEffect(() => {
    const canvas = holderRef.current?.querySelector('canvas');
    if (canvas) {
      try {
        setPng((canvas as HTMLCanvasElement).toDataURL('image/png'));
      } catch {
        setPng(null);
      }
    }
  }, [value]);

  return (
    <div className="ft-qr">
      <div ref={holderRef} className="ft-qr-source" aria-hidden="true">
        <QRCodeCanvas value={value} size={320} level="M" bgColor="#ffffff" fgColor="#000000" includeMargin />
      </div>
      {png && <img src={png} alt="Código QR AFIP" className="ft-qr-img" />}
    </div>
  );
}

export function FacturaTicket80mmBody({
  data,
  emisor,
  reprint,
}: {
  data: FacturaTicketData;
  emisor: FacturaTicketEmisor;
  reprint?: boolean;
}) {
  const tipoLabel = TIPO_LABELS[data.tipo_cbte] || `COMPROBANTE ${data.tipo_cbte}`;
  const isA = data.tipo_cbte === 1 || data.tipo_cbte === 3;
  const qrUrl = buildArcaQrUrl(data, emisor.cuit);
  const subtotal = data.items.reduce((s, i) => s + Number(i.subtotal || 0), 0);
  const discount = Number(data.discount || 0);

  return (
    <div className="ticket-80mm">
      <div className="ft-center">
        <div className="ft-title">{(emisor.nombre || 'ESTABLECIMIENTO').toUpperCase()}</div>
        {emisor.razon_social && <div className="ft-line">{emisor.razon_social}</div>}
        {emisor.cuit && <div className="ft-line">CUIT: {emisor.cuit}</div>}
        {emisor.domicilio && <div className="ft-line">{emisor.domicilio}</div>}
        {emisor.condicion_iva && (
          <div className="ft-line">{CONDICION_LABELS[emisor.condicion_iva] || emisor.condicion_iva}</div>
        )}
      </div>

      <Sep />

      <div className="ft-center ft-doc">{tipoLabel}</div>
      {reprint && <div className="ft-center ft-line ft-bold">*** REIMPRESIÓN ***</div>}
      <div className="ft-line">Punto de Venta: {String(data.punto_venta).padStart(5, '0')}</div>
      <div className="ft-line">N°: {String(data.cbte_numero).padStart(8, '0')}</div>
      <div className="ft-line">
        Fecha: {format(new Date(data.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}
      </div>

      <Sep />

      <div className="ft-line">Cliente:</div>
      <div className="ft-line ft-bold">
        {data.receptor_razon_social || (data.receptor_cuit ? data.receptor_cuit : 'CONSUMIDOR FINAL')}
      </div>
      {data.receptor_cuit && <div className="ft-line">CUIT: {data.receptor_cuit}</div>}
      <div className="ft-line">
        Condición IVA: {CONDICION_LABELS[data.receptor_condicion_iva || 'consumidor_final'] || data.receptor_condicion_iva}
      </div>

      <Sep />

      <div className="ft-items">
        {data.items.map((item, i) => (
          <div className="ft-item" key={i}>
            <div className="ft-item-name">
              {item.qty} x {item.name}
            </div>
            <div className="ft-item-amounts">
              <span>{money(item.unit_price)} c/u</span>
              <span className="ft-bold">{money(item.subtotal)}</span>
            </div>
          </div>
        ))}
      </div>

      <Sep />

      <div className="ft-row">
        <span>SUBTOTAL</span>
        <span>{money(subtotal)}</span>
      </div>
      {discount > 0 && (
        <div className="ft-row">
          <span>DESCUENTO</span>
          <span>-{money(discount)}</span>
        </div>
      )}
      {isA && data.neto_gravado != null && (
        <>
          <div className="ft-row">
            <span>NETO GRAVADO</span>
            <span>{money(Number(data.neto_gravado))}</span>
          </div>
          <div className="ft-row">
            <span>IVA 21%</span>
            <span>{money(Number(data.iva_amount || 0))}</span>
          </div>
        </>
      )}

      <div className="ft-total">
        <span>TOTAL</span>
        <span>{money(data.total)}</span>
      </div>

      <Sep />

      <div className="ft-line">Forma de pago:</div>
      <div className="ft-line ft-bold">
        {PAYMENT_LABELS[data.payment_method || ''] || (data.payment_method || '-').toUpperCase()}
      </div>

      <Sep />

      <div className="ft-line">CAE:</div>
      <div className="ft-line ft-bold ft-mono">{data.cae}</div>
      <div className="ft-line">Vto. CAE:</div>
      <div className="ft-line ft-bold">{fmtDate(parseCaeVto(data.cae_vto))}</div>

      {qrUrl && (
        <ArcaQr value={qrUrl} />
      )}

      <Sep />
      <div className="ft-center ft-line">Comprobante autorizado por ARCA</div>
      <div className="ft-center ft-line">¡Gracias por su compra!</div>
    </div>
  );
}

/** Render print-only a través de un portal en <body> (aislado de la app). */
export default function FacturaTicket80mm({
  data,
  emisor,
  reprint,
}: {
  data: FacturaTicketData;
  emisor: FacturaTicketEmisor;
  reprint?: boolean;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="print-portal print-ticket">
      <FacturaTicket80mmBody data={data} emisor={emisor} reprint={reprint} />
    </div>,
    document.body
  );
}
