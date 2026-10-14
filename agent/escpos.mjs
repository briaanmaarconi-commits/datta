// Formateador de comandas ESC/POS (puro, sin dependencias: se testea sin impresora).
const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

// Tildes y ñ: CP858 (ESC t 19). Si el modelo no la soporta se usa modo texto simple (sin acentos).
const CP858 = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5, 'ü': 0x81, 'Ü': 0x9a,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9, '¿': 0xa8, '¡': 0xad, '°': 0xf8, 'º': 0xa7, 'ª': 0xa6,
};
const PLAIN = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n', 'Ñ': 'N', 'ü': 'u', 'Ü': 'U',
  'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', '¿': '?', '¡': '!', '°': 'o', 'º': 'o', 'ª': 'a' };

export function encodeText(text, plain = false) {
  const out = [];
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (plain) out.push((PLAIN[ch] ?? '?').charCodeAt(0));
    else out.push(CP858[ch] ?? 0x3f);
  }
  return out;
}

const AREA_LABEL = { entrada: 'ENTRADA', principal: 'PLATO PRINCIPAL', postre: 'POSTRE' };
export const areaLabel = (a) => AREA_LABEL[a] ?? String(a ?? '').toUpperCase();

function wrap(text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= width) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
    while (cur.length > width) { lines.push(cur.slice(0, width)); cur = cur.slice(width); }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/**
 * job: { area, establishmentName, tableNumber, isDelivery, platform, customerName, sectorName,
 *        waiterName, createdAt, isAddition, reprint, items: [{quantity, name, notes}] }
 * opts: { paperWidth: 58|80, plain: boolean, cut: boolean }
 */
export function buildTicket(job, opts = {}) {
  const cols = opts.paperWidth === 58 ? 32 : 48;
  const plain = !!opts.plain;
  const b = [];
  const raw = (...x) => b.push(...x);
  const text = (s) => b.push(...encodeText(s, plain));
  const line = (s = '') => { text(s); raw(LF); };
  const align = (n) => raw(ESC, 0x61, n); // 0 izq, 1 centro
  const bold = (on) => raw(ESC, 0x45, on ? 1 : 0);
  const size = (w, h) => raw(GS, 0x21, ((w - 1) << 4) | (h - 1));
  const rule = (ch = '-') => line(ch.repeat(cols));

  raw(ESC, 0x40); // init
  if (!plain) raw(ESC, 0x74, 19); // CP858
  align(1);
  if (job.establishmentName) { bold(true); line(job.establishmentName); bold(false); }
  size(2, 2); bold(true); line(areaLabel(job.area)); size(1, 1); bold(false);
  rule('=');
  const kind = job.isDelivery ? 'COMANDA - DELIVERY' : job.isAddition ? 'COMANDA - AGREGADO' : 'COMANDA';
  bold(true); line(kind); bold(false);
  if (job.reprint) line('*** REIMPRESION ***');
  if (job.isDelivery) {
    size(2, 2); bold(true); line('DELIVERY'); size(1, 1); bold(false);
    if (job.platform) line(job.platform);
    if (job.customerName) line('Cliente: ' + job.customerName);
  } else {
    size(2, 2); bold(true); line('MESA ' + (job.tableNumber ?? '-')); size(1, 1); bold(false);
    if (job.sectorName) line('Sector: ' + job.sectorName);
  }
  if (job.waiterName) line('Mozo: ' + job.waiterName);
  const d = job.createdAt ? new Date(job.createdAt) : new Date();
  line(d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
  rule();
  align(0);
  for (const it of job.items ?? []) {
    bold(true); size(1, 2);
    for (const l of wrap(`${it.quantity} x ${it.name}`, cols)) line(l);
    size(1, 1); bold(false);
    if (it.notes) for (const l of wrap('> ' + it.notes, cols - 2)) line('  ' + l);
  }
  rule();
  raw(LF, LF, LF);
  if (opts.cut !== false) raw(GS, 0x56, 0x42, 0x00); // corte parcial con avance
  return Uint8Array.from(b);
}
