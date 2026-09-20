import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import type { FacturaTicketData, FacturaTicketEmisor } from '@/components/cashier/FacturaTicket80mm';
import { buildArcaQrUrl } from '@/components/cashier/FacturaTicket80mm';

const TIPO_LABELS: Record<number, { titulo: string; letra: string; cod: string }> = {
  1: { titulo: 'FACTURA', letra: 'A', cod: '01' },
  3: { titulo: 'NOTA DE CRÉDITO', letra: 'A', cod: '03' },
  6: { titulo: 'FACTURA', letra: 'B', cod: '06' },
  8: { titulo: 'NOTA DE CRÉDITO', letra: 'B', cod: '08' },
  11: { titulo: 'FACTURA', letra: 'C', cod: '11' },
  13: { titulo: 'NOTA DE CRÉDITO', letra: 'C', cod: '13' },
};

const CONDICION_LABELS: Record<string, string> = {
  consumidor_final: 'Consumidor Final',
  responsable_inscripto: 'IVA Responsable Inscripto',
  monotributo: 'Responsable Monotributo',
  exento: 'IVA Exento',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
};

const money = (n: number) =>
  '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseCaeVto(v?: string) {
  if (!v) return '-';
  if (/^\d{8}$/.test(v)) return `${v.slice(6, 8)}/${v.slice(4, 6)}/${v.slice(0, 4)}`;
  const d = new Date(v);
  return isNaN(d.getTime()) ? '-' : format(d, 'dd/MM/yyyy');
}

/** Genera y descarga la factura autorizada en PDF A4 (formato ARCA con QR y CAE). */
export async function downloadFacturaPdf(data: FacturaTicketData, emisor: FacturaTicketEmisor) {
  const tipo = TIPO_LABELS[data.tipo_cbte] || { titulo: 'COMPROBANTE', letra: '', cod: String(data.tipo_cbte) };
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 15;

  const qrUrl = buildArcaQrUrl(data, emisor.cuit);
  let qrPng: string | null = null;
  if (qrUrl) {
    try {
      qrPng = await QRCode.toDataURL(qrUrl, { margin: 1, width: 400 });
    } catch {
      qrPng = null;
    }
  }

  const items = data.items || [];
  const FULL = 39;
  const LAST = 26;
  const pages: typeof items[] = [];
  let i = 0;
  while (i < items.length) {
    const rest = items.length - i;
    const n = rest > LAST ? FULL : rest;
    pages.push(items.slice(i, i + n));
    i += n;
  }
  if (pages.length === 0) pages.push([]);
  if (pages[pages.length - 1].length > LAST) {
    const tail = pages.pop()!;
    pages.push(tail.slice(0, LAST), tail.slice(LAST));
  }

  const subtotalItems = items.reduce((s, it) => s + Number(it.subtotal || 0), 0);
  const discount = Number(data.discount || 0);

  pages.forEach((chunk, idx) => {
    if (idx > 0) doc.addPage();
    const page = idx + 1;

    // Encabezado
    let y = 15;
    doc.setLineWidth(0.3);
    doc.rect(M, y, W - 2 * M, 42);
    doc.line(W / 2, y, W / 2, y + 42);
    doc.rect(W / 2 - 9, y, 18, 14);
    doc.setFont('helvetica', 'bold').setFontSize(22);
    doc.text(tipo.letra, W / 2, y + 10, { align: 'center' });
    doc.setFont('helvetica', 'normal').setFontSize(6.5);
    doc.text('COD. ' + tipo.cod, W / 2, y + 13, { align: 'center' });

    doc.setFont('helvetica', 'bold').setFontSize(14);
    doc.text((emisor.nombre || 'ESTABLECIMIENTO').toUpperCase(), M + 6, y + 9);
    doc.setFont('helvetica', 'normal').setFontSize(8.5);
    [
      emisor.razon_social || '',
      emisor.domicilio || '',
      emisor.cuit ? `CUIT: ${emisor.cuit}` : '',
      CONDICION_LABELS[emisor.condicion_iva || ''] || emisor.condicion_iva || '',
    ]
      .filter(Boolean)
      .forEach((t, k) => doc.text(String(t).slice(0, 60), M + 6, y + 15 + k * 4.6));

    const x2 = W / 2 + 13;
    doc.setFont('helvetica', 'bold').setFontSize(13);
    doc.text(tipo.titulo, x2, y + 9);
    doc.setFont('helvetica', 'normal').setFontSize(9);
    doc.text(
      `Punto de Venta: ${String(data.punto_venta).padStart(5, '0')}    Comp. Nro: ${String(data.cbte_numero).padStart(8, '0')}`,
      x2,
      y + 16
    );
    doc.text('Fecha de Emisión: ' + format(new Date(data.created_at), 'dd/MM/yyyy'), x2, y + 21);
    doc.text(`Página ${page} de ${pages.length}`, x2, y + 26);

    // Receptor
    let ry = y + 45;
    doc.rect(M, ry, W - 2 * M, 20);
    doc.setFontSize(9);
    doc.text(`CUIT / DNI: ${data.receptor_cuit || '-'}`, M + 4, ry + 6);
    doc.text(
      `Condición frente al IVA: ${CONDICION_LABELS[data.receptor_condicion_iva || 'consumidor_final'] || data.receptor_condicion_iva || ''}`,
      M + 75,
      ry + 6
    );
    doc.text(
      `Apellido y Nombre / Razón Social: ${data.receptor_razon_social || 'CONSUMIDOR FINAL'}`.slice(0, 80),
      M + 4,
      ry + 11.5
    );
    doc.text(
      `Condición de venta: ${PAYMENT_LABELS[data.payment_method || ''] || data.payment_method || '-'}`,
      M + 4,
      ry + 17
    );

    // Tabla
    let ty = ry + 26;
    doc.setFillColor(230, 230, 230);
    doc.rect(M, ty, W - 2 * M, 6, 'FD');
    doc.setFont('helvetica', 'bold').setFontSize(8);
    doc.text('Descripción', M + 2, ty + 4);
    doc.text('Cant.', M + 126, ty + 4, { align: 'right' });
    doc.text('P. Unitario', M + 150, ty + 4, { align: 'right' });
    doc.text('Subtotal', W - M - 2, ty + 4, { align: 'right' });

    doc.setFont('helvetica', 'normal').setFontSize(8);
    let cy = ty + 6;
    chunk.forEach(it => {
      cy += 4.6;
      const name = String(it.name || '').slice(0, 62);
      doc.text(name, M + 2, cy);
      doc.text(String(it.qty), M + 126, cy, { align: 'right' });
      doc.text(money(Number(it.unit_price)), M + 150, cy, { align: 'right' });
      doc.text(money(Number(it.subtotal)), W - M - 2, cy, { align: 'right' });
    });

    if (page === pages.length) {
      const base = 235;
      doc.setFontSize(9);
      let ly = base;
      const line = (label: string, value: string, bold = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 11 : 9);
        doc.text(label, W - M - 40, ly, { align: 'right' });
        doc.text(value, W - M - 2, ly, { align: 'right' });
        ly += bold ? 8 : 6;
      };
      line('Subtotal:', money(subtotalItems));
      if (discount > 0) line('Descuento:', '-' + money(discount));
      if (data.neto_gravado != null) {
        line('Importe Neto Gravado:', money(Number(data.neto_gravado)));
        line('IVA 21%:', money(Number(data.iva_amount || 0)));
      }
      line('Importe Total:', money(Number(data.total)), true);

      if (qrPng) doc.addImage(qrPng, 'PNG', M, 252, 34, 34);
      doc.setFont('helvetica', 'normal').setFontSize(9);
      doc.text('Comprobante Autorizado por ARCA (AFIP)', M + 40, 258);
      doc.setFont('helvetica', 'bold').setFontSize(10);
      doc.text('CAE N°: ' + data.cae, M + 40, 266);
      doc.text('Fecha de Vto. de CAE: ' + parseCaeVto(data.cae_vto), M + 40, 273);
    }
  });

  const fileName = `${tipo.titulo.replace(/\s/g, '_')}_${tipo.letra}_${String(data.punto_venta).padStart(4, '0')}-${String(
    data.cbte_numero
  ).padStart(8, '0')}.pdf`;
  doc.save(fileName);
}
