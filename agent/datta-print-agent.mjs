#!/usr/bin/env node
// Agente de impresión de Datta (v1). Corre en la PC de cocina y reparte comandas a impresoras por nombre.
// Escucha SOLO en 127.0.0.1 y rechaza cualquier página que no sea Datta (control de Origin).
//   node datta-print-agent.mjs                  → imprime en Windows (RAW al spooler)
//   node datta-print-agent.mjs --sink ./salida  → guarda cada ticket en un archivo (pruebas sin impresora)
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildTicket } from './escpos.mjs';

const VERSION = '1.0.0';
const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const PORT = Number(argVal('--port') ?? process.env.DATTA_AGENT_PORT ?? 9101);
const SINK = argVal('--sink') ? resolve(argVal('--sink')) : null;
const ORIGINS = new Set(
  (process.env.DATTA_ALLOWED_ORIGINS ??
    'https://dattagestion.com,https://www.dattagestion.com,https://datta.sistemagenesis.tech,http://localhost:8080,http://localhost:5173')
    .split(',').map((s) => s.trim()).filter(Boolean),
);

// Envío RAW al spooler de Windows (sirve para USB y para impresoras de red instaladas en Windows).
const PS_RAW = `
param([string]$Printer, [string]$File)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class RawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool StartDocPrinter(IntPtr h, int l, [In] DOCINFO d);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);
  public static string Send(string printer, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "No se pudo abrir la impresora '" + printer + "' (error " + Marshal.GetLastWin32Error() + ")";
    var di = new DOCINFO { pDocName = "Comanda Datta", pDataType = "RAW" };
    try {
      if (!StartDocPrinter(h, 1, di)) return "StartDocPrinter fallo (" + Marshal.GetLastWin32Error() + ")";
      StartPagePrinter(h);
      int w; bool ok = WritePrinter(h, bytes, bytes.Length, out w);
      EndPagePrinter(h); EndDocPrinter(h);
      return ok && w == bytes.Length ? "" : "WritePrinter fallo (" + Marshal.GetLastWin32Error() + ")";
    } finally { ClosePrinter(h); }
  }
}
"@
$bytes = [System.IO.File]::ReadAllBytes($File)
$err = [RawPrint]::Send($Printer, $bytes)
if ($err) { [Console]::Error.WriteLine($err); exit 1 }
`;

function runPs(argv) {
  return new Promise((res, rej) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...argv], { windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', rej);
    p.on('close', (code) => (code === 0 ? res(out) : rej(new Error((err || out || `powershell salió con ${code}`).trim()))));
  });
}

async function listPrinters() {
  if (SINK) return ['(modo prueba: archivos)'];
  const out = await runPs(['-Command', 'Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress']);
  const v = JSON.parse(out || '[]');
  return Array.isArray(v) ? v : [v];
}

let psFile = null;
async function printRaw(printerName, bytes) {
  if (SINK) {
    await mkdir(SINK, { recursive: true });
    const safe = printerName.replace(/[^\w.-]+/g, '_');
    await writeFile(join(SINK, `${Date.now()}-${safe}.bin`), bytes);
    return;
  }
  const dir = tmpdir();
  if (!psFile) {
    psFile = join(dir, 'datta-rawprint.ps1');
    await writeFile(psFile, PS_RAW, 'utf8');
  }
  const data = join(dir, `datta-${randomUUID()}.bin`);
  await writeFile(data, bytes);
  try {
    await runPs(['-File', psFile, '-Printer', printerName, '-File', data]);
  } finally {
    await unlink(data).catch(() => {});
  }
}

// Solo páginas de Datta pueden hablar con el agente (también se rechaza el POST, no solo el preflight).
function cors(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    if (!ORIGINS.has(origin)) return false;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true'); // Chrome: HTTPS público → localhost
  }
  return true;
}
const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readJson = (req) =>
  new Promise((res, rej) => {
    let n = 0;
    const ch = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > 256 * 1024) {
        rej(new Error('Solicitud demasiado grande'));
        req.destroy();
      } else ch.push(c);
    });
    req.on('end', () => {
      try {
        res(JSON.parse(Buffer.concat(ch).toString('utf8') || '{}'));
      } catch (e) {
        rej(e);
      }
    });
    req.on('error', rej);
  });

const server = http.createServer(async (req, res) => {
  if (!cors(req, res)) return send(res, 403, { ok: false, error: 'Origen no permitido' });
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/status') {
      return send(res, 200, { ok: true, version: VERSION, sink: !!SINK, platform: process.platform });
    }
    if (req.method === 'GET' && url.pathname === '/printers') {
      return send(res, 200, { ok: true, printers: await listPrinters() });
    }
    if (req.method === 'POST' && url.pathname === '/print') {
      const b = await readJson(req);
      if (!b.printer || typeof b.printer !== 'string') return send(res, 400, { ok: false, error: 'Falta la impresora' });
      if (!b.job || !Array.isArray(b.job.items)) return send(res, 400, { ok: false, error: 'Comanda inválida' });
      const bytes = buildTicket(b.job, { paperWidth: b.paperWidth === 58 ? 58 : 80, plain: !!b.plain, cut: b.cut !== false });
      await printRaw(b.printer, bytes);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { ok: false, error: 'No encontrado' });
  } catch (e) {
    return send(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Agente Datta ${VERSION} escuchando en http://127.0.0.1:${PORT}${SINK ? ` (modo prueba → ${SINK})` : ''}`);
});
