// View state in the URL hash, so a link reproduces what the sender saw (page, slicers,
// selections, drill). Base64url of the JSON state.
import type { ViewState } from '../core/types.js';

export function encodeState(s: ViewState): string {
  const json = JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState(s: string): ViewState | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const v = JSON.parse(new TextDecoder().decode(bytes));
    return v && typeof v === 'object' && typeof v.page === 'string' ? (v as ViewState) : null;
  } catch {
    return null;
  }
}

export function stateFromHash(hash = location.hash): ViewState | null {
  const m = /[#&]s=([\w-]+)/.exec(hash);
  return m ? decodeState(m[1]!) : null;
}

export function writeHash(s: ViewState): void {
  const enc = encodeState(s);
  history.replaceState(null, '', `${location.pathname}${location.search}#s=${enc}`);
}
