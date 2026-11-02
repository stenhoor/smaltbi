// Data URLs as people paste them vs. what a browser page can read (CORS).
// Ported from smaltui (app/urls.js): part of the shared smalt kit, see docs/adr/0003-shared-kit.md.

const rules: { re: RegExp; to: (m: RegExpExecArray) => string; host: string }[] = [
  {
    re: /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/i,
    to: (m) => `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`,
    host: 'GitHub',
  },
  {
    re: /^https?:\/\/huggingface\.co\/(datasets\/|spaces\/)?([^/]+\/[^/]+)\/blob\/(.+)$/i,
    to: (m) => `https://huggingface.co/${m[1] ?? ''}${m[2]}/resolve/${m[3]}`,
    host: 'Hugging Face',
  },
];

/** Rewrite a pasted data URL to one the browser can fetch. */
export function normalizeDataUrl(input: string): { url: string; changed: boolean; note: string } {
  const raw = String(input ?? '').trim();
  if (!/^https?:\/\//i.test(raw)) return { url: raw, changed: false, note: '' };
  const url = raw.replace(/[?&]raw=true$/i, '');
  for (const r of rules) {
    const m = r.re.exec(url);
    if (m) {
      const to = r.to(m).replace(/[?#].*$/, '');
      return { url: to, changed: to !== raw, note: `${r.host} file pages can't be read by other sites; using the raw file: ${to}` };
    }
  }
  return { url, changed: url !== raw, note: '' };
}

/** Extra help for a CORS / network error. '' when the message is not about CORS. */
export function corsHint(message: string): string {
  if (!/CORS|cross-origin|Failed to fetch|NetworkError|Load failed/i.test(message)) return '';
  for (const u of message.match(/https?:\/\/[^\s'")]+/g) ?? []) {
    const n = normalizeDataUrl(u.replace(/[.,:;]+$/, ''));
    if (n.changed) return `Use the raw file instead: ${n.url}`;
  }
  return 'The browser blocks reading files from servers that do not send CORS headers. Use a CORS-enabled host, or download the file and import it from your computer.';
}
