// Configuración de impresión de ESTA computadora (se guarda en el navegador de la PC).
// El navegador no puede listar ni elegir impresoras: siempre imprime en la predeterminada de Windows.
// Por eso la configuración se reduce a: qué imprime esta PC, ancho de papel y abrir Datta con
// impresión directa (--kiosk-printing) para que no aparezca el cuadro de impresión.

export type PrintRole = 'kitchen' | 'cashier' | 'both';
export type PaperWidth = 80 | 58;

export interface PrintSetup {
  role: PrintRole;
  paper: PaperWidth;
  /** Resultado de la última prueba: la impresión salió sin cuadro de diálogo. */
  directPrint: boolean | null;
  testedAt: string | null;
}

const KEY = 'datta.printSetup';
const DEFAULT: PrintSetup = { role: 'cashier', paper: 80, directPrint: null, testedAt: null };

export function getPrintSetup(): PrintSetup {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function savePrintSetup(s: PrintSetup) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* navegador sin almacenamiento: se usa el valor por defecto */
  }
  applyPaperWidth(s.paper);
}

/** Ajusta el ancho de los tickets (80 o 58 mm) para todas las impresiones de esta PC. */
export function applyPaperWidth(paper: PaperWidth = getPrintSetup().paper) {
  document.documentElement.dataset.paper = String(paper);
  let style = document.getElementById('datta-paper-size') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'datta-paper-size';
    document.head.appendChild(style);
  }
  // @page no admite selectores: se reemplaza la regla según el papel elegido.
  style.textContent = paper === 58 ? '@media print { @page { size: 58mm auto; margin: 0; } }' : '';
}

/**
 * Imprime y mide si apareció el cuadro de impresión: con el cuadro, window.print() bloquea hasta que
 * el usuario lo cierra; con impresión directa vuelve enseguida.
 */
export function printAndDetectDialog(): boolean {
  const t0 = performance.now();
  window.print();
  return performance.now() - t0 > 900;
}

export const ROLE_LABEL: Record<PrintRole, string> = { kitchen: 'Cocina', cashier: 'Caja', both: 'Caja y cocina' };
const ROLE_PATH: Record<PrintRole, string> = { kitchen: '/kitchen', cashier: '/login', both: '/login' };

/**
 * Archivo .bat para Windows: crea el acceso directo "Datta <rol>" en el escritorio que abre Datta con
 * impresión directa, en un perfil propio (así la opción funciona aunque Chrome ya esté abierto).
 */
export function directPrintLauncher(role: PrintRole, origin = window.location.origin) {
  const name = `Datta ${ROLE_LABEL[role]}`;
  const url = `${origin}${ROLE_PATH[role]}`;
  const bat = [
    '@echo off',
    `title ${name} - impresion directa`,
    `set "URL=${url}"`,
    'set "PROFILE=%LOCALAPPDATA%\\DattaPOS"',
    'set "BROWSER=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%BROWSER%" set "BROWSER=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%BROWSER%" set "BROWSER=%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%BROWSER%" set "BROWSER=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"',
    'if not exist "%BROWSER%" set "BROWSER=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"',
    'if not exist "%BROWSER%" (',
    '  echo No se encontro Google Chrome ni Microsoft Edge. Instala Chrome y volve a ejecutar este archivo.',
    '  pause',
    '  exit /b 1',
    ')',
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\\${name}.lnk'); $s.TargetPath=$env:BROWSER; $s.Arguments='--kiosk-printing --user-data-dir=\\"'+$env:PROFILE+'\\" --app='+$env:URL; $s.Description='${name} (impresion directa)'; $s.Save()"`,
    `echo Listo: se creo el acceso directo "${name}" en el escritorio.`,
    'echo Desde ahora abri Datta siempre con ese icono. La primera vez vas a tener que iniciar sesion.',
    'start "" "%BROWSER%" --kiosk-printing --user-data-dir="%PROFILE%" --app=%URL%',
    'timeout /t 6 >nul',
  ].join('\r\n');
  return { filename: `${name.replace(/\s+/g, '-')}.bat`, content: bat };
}
