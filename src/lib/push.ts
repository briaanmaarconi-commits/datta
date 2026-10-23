// Avisos al celular (Web Push) para el mozo: "pedido listo" le llega aunque tenga Datta cerrado.
import { viewAsHeaders } from './viewAs';

const SW_URL = '/push-sw.js';

export type PushState = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

async function api(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...viewAsHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Error ${res.status}`);
  return json;
}

function b64ToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration(SW_URL)) ?? navigator.serviceWorker.register(SW_URL);
}

export async function pushState(): Promise<PushState> {
  // En iPhone los avisos solo funcionan con Datta agregado a la pantalla de inicio.
  if (isIos() && !isStandalone()) return 'ios-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    // Se vuelve a guardar por si el celular cambió de usuario o el servidor la borró.
    await api('/api/push/subscribe', sub.toJSON()).catch(() => undefined);
    return 'on';
  }
  return 'off';
}

/** Pide permiso y suscribe este celular. Tiene que llamarse desde un toque del usuario. */
export async function enablePush(): Promise<PushState> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { publicKey } = await api('/api/push/key');
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
  await api('/api/push/subscribe', sub.toJSON());
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return 'off';
}

export const testPush = () => api('/api/push/test', {});

/** Al cerrar sesión: este celular deja de recibir avisos de ese usuario (el permiso queda para el próximo). */
export async function forgetPushOnThisDevice() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration(SW_URL);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await api('/api/push/unsubscribe', { endpoint: sub.endpoint });
  } catch {
    /* sin avisos en este navegador */
  }
}
