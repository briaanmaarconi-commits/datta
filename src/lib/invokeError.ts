export async function edgeErrorMessage(error: any, fallback = 'Error inesperado'): Promise<string> {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.clone().json();
      const msg = body?.error || body?.message;
      if (msg) return translate(String(msg));
    }
  } catch { /* ignore */ }
  return translate(error?.message || fallback);
}

function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already been registered') || m.includes('already registered') || m.includes('already exists'))
    return 'Ese email ya está registrado. Usá otro email.';
  if (m.includes('password') && (m.includes('weak') || m.includes('at least') || m.includes('characters')))
    return 'La contraseña es muy débil: usá al menos 6 caracteres (mejor con letras y números).';
  if (m.includes('invalid') && m.includes('email')) return 'El email no es válido.';
  if (m === 'unauthorized') return 'Tu sesión venció. Cerrá sesión y volvé a entrar.';
  if (m === 'forbidden') return 'No tenés permiso para esta acción.';
  return msg;
}
