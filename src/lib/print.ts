/**
 * Print helper for 80mm thermal tickets rendered through a portal on <body>.
 * Adds `printing-ticket` to <body> so the CSS hides the app and shows only the
 * portal, fires the print job and cleans up on `afterprint` (with a fallback).
 */
export function printTicketPortal(onDone?: () => void, delay = 250) {
  let finished = false;

  const cleanup = () => {
    if (finished) return;
    finished = true;
    window.removeEventListener('afterprint', cleanup);
    document.body.classList.remove('printing-ticket');
    onDone?.();
  };

  document.body.classList.add('printing-ticket');
  window.addEventListener('afterprint', cleanup);

  const timer = setTimeout(() => {
    window.print();
    setTimeout(cleanup, 1500);
  }, delay);

  return () => {
    clearTimeout(timer);
    cleanup();
  };
}
