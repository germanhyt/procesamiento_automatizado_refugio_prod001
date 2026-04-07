/**
 * Extrae el claim `sub` del access token JWT sin verificar firma.
 * El backend (`/auth/login`) guarda ahí el `username` del runner; sirve solo para mostrar nombre en UI.
 * La seguridad real sigue en el token completo al llamar a la API.
 */
export function getAccessTokenSubject(token: string | null | undefined): string | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const atobFn = typeof globalThis.atob === 'function' ? globalThis.atob.bind(globalThis) : null;
    if (!atobFn) return null;
    const json = atobFn(b64);
    const payload = JSON.parse(json) as { sub?: unknown };
    const sub = payload?.sub;
    if (typeof sub !== 'string' || !sub.trim()) return null;
    return sub.trim();
  } catch {
    return null;
  }
}
