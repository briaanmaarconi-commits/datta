import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

// Facturas que Datta emite a sus clientes por la suscripción (ver backend/src/lib/dattaInvoice.ts).
export { callFn } from '@/lib/fnApi';

export interface InvoiceParty {
  cuit: string | null;
  razon_social: string | null;
  condicion_iva: string | null;
  domicilio: string | null;
  name?: string | null;
  punto_venta?: number | null;
  iibb?: string | null;
  inicio_actividades?: string | null;
}

export interface DattaInvoice {
  id: string;
  establishment_id?: string;
  client_payment_id: string | null;
  environment: 'testing' | 'production';
  tipo_cbte: number;
  punto_venta: number;
  cbte_numero: number;
  cae: string;
  cae_vto: string | null;
  issue_date: string;
  period_from: string | null;
  period_to: string | null;
  description: string;
  total: number;
  neto_gravado: number;
  iva_amount: number;
  emisor: InvoiceParty;
  receptor: InvoiceParty;
}

const TIPO: Record<number, { letra: string; nombre: string }> = {
  1: { letra: 'A', nombre: 'FACTURA' },
  6: { letra: 'B', nombre: 'FACTURA' },
  11: { letra: 'C', nombre: 'FACTURA' },
};

export const CONDICION_IVA: Record<string, string> = {
  monotributo: 'Responsable Monotributo',
  responsable_inscripto: 'IVA Responsable Inscripto',
  exento: 'IVA Sujeto Exento',
  consumidor_final: 'Consumidor Final',
};

export const invoiceLabel = (i: Pick<DattaInvoice, 'tipo_cbte' | 'punto_venta' | 'cbte_numero'>) =>
  `Factura ${TIPO[i.tipo_cbte]?.letra ?? ''} ${String(i.punto_venta).padStart(5, '0')}-${String(i.cbte_numero).padStart(8, '0')}`;

const pesos = (n: number) => `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dmy = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '-');
const digits = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '');
const fmtCuit = (s: string | null | undefined) => {
  const d = digits(s);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : d || '-';
};

/** URL del QR de ARCA (RG 4892). */
export function arcaQrUrl(i: DattaInvoice): string {
  const rec = digits(i.receptor.cuit);
  const payload = {
    ver: 1, fecha: i.issue_date, cuit: Number(digits(i.emisor.cuit)), ptoVta: i.punto_venta, tipoCmp: i.tipo_cbte,
    nroCmp: Number(i.cbte_numero), importe: Number(Number(i.total).toFixed(2)), moneda: 'PES', ctz: 1,
    tipoDocRec: rec ? 80 : 99, nroDocRec: rec ? Number(rec) : 0, tipoCodAut: 'E', codAut: Number(i.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(payload))}`;
}

/** Descarga el PDF A4 de la factura. */
export async function downloadInvoicePdf(i: DattaInvoice) {
  (await buildInvoicePdf(i)).save(`${invoiceLabel(i).replace(/\s+/g, '-')}.pdf`);
}

/** Arma el PDF A4 de la factura (original). */
export async function buildInvoicePdf(i: DattaInvoice): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 12;
  const tipo = TIPO[i.tipo_cbte] ?? { letra: '?', nombre: 'COMPROBANTE' };
  const e = i.emisor;
  const r = i.receptor;

  doc.setDrawColor(40);
  doc.setLineWidth(0.3);

  // Encabezado: "ORIGINAL"
  doc.rect(M, M, W - 2 * M, 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ORIGINAL', W / 2, M + 5.6, { align: 'center' });

  // Bloque emisor / comprobante con la letra al centro
  const top = M + 8;
  const h = 46;
  doc.rect(M, top, W - 2 * M, h);
  doc.line(W / 2, top + 14, W / 2, top + h);
  doc.rect(W / 2 - 9, top, 18, 14);
  doc.setFontSize(24);
  doc.text(tipo.letra, W / 2, top + 9.5, { align: 'center' });
  doc.setFontSize(6.5);
  doc.text(`COD. ${String(i.tipo_cbte).padStart(3, '0')}`, W / 2, top + 12.8, { align: 'center' });

  // "Etiqueta: valor" (etiqueta en negrita, medida en negrita). Devuelve dónde termina el texto.
  doc.setFontSize(8.5);
  const kv = (x: number, yy: number, label: string, value: string, maxRight = W - M - 3) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, x, yy);
    const vx = x + doc.getTextWidth(`${label}:`) + 1.5;
    doc.setFont('helvetica', 'normal');
    const v = doc.splitTextToSize(value, Math.max(10, maxRight - vx))[0] ?? '';
    doc.text(v, vx, yy);
    return vx + doc.getTextWidth(v);
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(doc.splitTextToSize(e.razon_social || 'Datta', W / 2 - M - 16)[0], M + 4, top + 11);
  doc.setFontSize(8.5);
  let y = top + 22;
  kv(M + 4, y, 'Razón social', e.razon_social || '-', W / 2 - 3);
  kv(M + 4, y + 6, 'Domicilio comercial', e.domicilio || '-', W / 2 - 3);
  kv(M + 4, y + 12, 'Condición frente al IVA', CONDICION_IVA[e.condicion_iva ?? ''] ?? '-', W / 2 - 3);

  const rx = W / 2 + 13;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(tipo.nombre, rx, top + 11);
  doc.setFontSize(8.5);
  y = top + 20;
  const rx0 = W / 2 + 4;
  kv(rx0, y, 'Punto de venta', String(i.punto_venta).padStart(5, '0'));
  kv(rx0 + 42, y, 'Comp. Nro', String(i.cbte_numero).padStart(8, '0'));
  kv(rx0, y + 5.5, 'Fecha de emisión', dmy(i.issue_date));
  kv(rx0, y + 11, 'CUIT', fmtCuit(e.cuit));
  kv(rx0, y + 16.5, 'Ingresos Brutos', e.iibb || '-');
  kv(rx0, y + 22, 'Inicio de actividades', dmy(e.inicio_actividades));

  // Período facturado
  y = top + h;
  doc.rect(M, y, W - 2 * M, 8);
  let px = M + 4;
  for (const [k, v] of [['Período facturado desde', dmy(i.period_from)], ['Hasta', dmy(i.period_to)], ['Fecha de vto. para el pago', dmy(i.issue_date)]]) {
    px = kv(px, y + 5.4, k, v) + 8;
  }

  // Receptor
  y += 8;
  doc.rect(M, y, W - 2 * M, 18);
  const x2 = M + 80;
  kv(M + 4, y + 5, 'CUIT', r.cuit ? fmtCuit(r.cuit) : 'Consumidor final', x2 - 3);
  kv(x2, y + 5, 'Razón social', r.razon_social || r.name || '-');
  kv(M + 4, y + 10.5, 'Condición frente al IVA', CONDICION_IVA[r.condicion_iva ?? ''] ?? '-', x2 - 3);
  kv(x2, y + 10.5, 'Domicilio', r.domicilio || '-');
  kv(M + 4, y + 16, 'Condición de venta', 'Otra', x2 - 3);

  // Detalle
  const discrimina = i.tipo_cbte === 1;
  autoTable(doc, {
    startY: y + 22,
    margin: { left: M, right: M },
    head: [discrimina
      ? ['Código', 'Producto / Servicio', 'Cantidad', 'U. medida', 'Precio unit.', 'Subtotal', 'Alícuota IVA', 'Subtotal c/IVA']
      : ['Código', 'Producto / Servicio', 'Cantidad', 'U. medida', 'Precio unit.', 'Subtotal']],
    body: [discrimina
      ? ['001', i.description, '1,00', 'unidades', pesos(i.neto_gravado), pesos(i.neto_gravado), '21%', pesos(i.total)]
      : ['001', i.description, '1,00', 'unidades', pesos(i.total), pesos(i.total)]],
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    theme: 'grid',
  });

  // Totales
  const totalsTop = 222;
  doc.rect(M, totalsTop, W - 2 * M, discrimina ? 26 : 16);
  doc.setFontSize(10);
  const totals = discrimina
    ? [['Importe neto gravado', pesos(i.neto_gravado)], ['IVA 21%', pesos(i.iva_amount)], ['Importe total', pesos(i.total)]]
    : [['Subtotal', pesos(i.total)], ['Importe total', pesos(i.total)]];
  let ty = totalsTop + 6.5;
  for (const [k, v] of totals) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${k}:`, W - M - 50, ty, { align: 'right' });
    doc.text(v, W - M - 4, ty, { align: 'right' });
    ty += 7;
  }

  // QR + CAE
  const qr = await QRCode.toDataURL(arcaQrUrl(i), { margin: 0, width: 240 });
  const qy = 254;
  doc.addImage(qr, 'PNG', M, qy, 28, 28);
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(11);
  doc.text('Comprobante autorizado', M + 32, qy + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Esta factura puede verificarse en el sitio de ARCA escaneando el código QR.', M + 32, qy + 13);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`CAE N°: ${i.cae}`, W - M - 4, qy + 8, { align: 'right' });
  doc.text(`Fecha de vto. de CAE: ${dmy(i.cae_vto)}`, W - M - 4, qy + 14, { align: 'right' });

  if (i.environment === 'testing') {
    doc.setTextColor(220, 60, 60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('COMPROBANTE DE PRUEBA (HOMOLOGACIÓN) - SIN VALIDEZ FISCAL', W / 2, 200, { align: 'center' });
    doc.setTextColor(0);
  }

  return doc;
}
