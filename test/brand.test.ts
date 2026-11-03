import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BUILTIN_THEMES, mergeTheme, themeCss } from '../src/theme/theme.js';

// WCAG 2 relative luminance and contrast ratio.
function lum(hex: string): number {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const tokens = JSON.parse(readFileSync('brand/tokens.json', 'utf8')) as { color: { tokens: { name: string; value: string | { light: string; dark: string } }[] } };
const tok = (name: string, mode: 'light' | 'dark') => {
  const t = tokens.color.tokens.find((x) => x.name === name)!;
  let v = typeof t.value === 'string' ? t.value : t.value[mode];
  const ref = /^\{(.+)\}$/.exec(v);
  if (ref) v = tok(ref[1]!, mode);
  return v.toUpperCase();
};

test('the Smalt theme uses the Kiln tokens from smalt-brand', () => {
  const t = BUILTIN_THEMES.smalt!;
  const pairs: [string, string][] = [
    ['background', 'bg'],
    ['surface', 'surface'],
    ['text', 'text'],
    ['muted', 'text-3'],
    ['border', 'border'],
    ['accent', 'primary'],
    ['positive', 'success'],
    ['negative', 'danger'],
  ];
  for (const [ours, theirs] of pairs) {
    const light = (t.colors as Record<string, string>)[ours]!;
    const dark = (t.dark!.colors as Record<string, string>)[ours]!;
    assert.equal(light.toUpperCase(), tok(theirs, 'light'), `light ${ours} = ${theirs}`);
    assert.equal(dark.toUpperCase(), tok(theirs, 'dark'), `dark ${ours} = ${theirs}`);
  }
  assert.match(t.fonts!.body!, /^Geist,/);
});

test('every built-in theme: series colours >= 3:1 and text >= 4.5:1 on the card surface, in both modes', () => {
  for (const [name, raw] of Object.entries(BUILTIN_THEMES)) {
    const t = mergeTheme(BUILTIN_THEMES.smalt!, raw);
    const modes = [{ colors: t.colors!, palette: t.palette! }];
    if (raw.dark?.colors) modes.push({ colors: { ...t.colors!, ...raw.dark.colors }, palette: raw.dark.palette ?? t.palette! });
    for (const [i, m] of modes.entries()) {
      const where = `${name} ${i ? 'dark' : 'light'}`;
      for (const c of m.palette) assert.ok(ratio(c, m.colors.surface!) >= 3, `${where}: series ${c} is ${ratio(c, m.colors.surface!).toFixed(2)}:1`);
      assert.ok(ratio(m.colors.text!, m.colors.surface!) >= 4.5, `${where}: text`);
      assert.ok(ratio(m.colors.muted!, m.colors.surface!) >= 4.5, `${where}: muted text`);
      // Data labels drawn on a series colour (pie slices, tiles): readable on most of the palette.
      const onMark = m.colors.onMark ?? '#FFFFFF';
      const readable = m.palette.filter((c) => ratio(onMark, c) >= 3).length;
      assert.ok(readable >= m.palette.length * 0.75, `${where}: on-mark text ${onMark} is >= 3:1 on only ${readable}/${m.palette.length} series colours`);
    }
  }
});

test('brand assets are the smalt-brand copies, with their source recorded', () => {
  const source = JSON.parse(readFileSync('brand/SOURCE.json', 'utf8')) as { repo: string; commit: string; files: Record<string, string> };
  assert.equal(source.repo, 'stenhoor/smalt-brand');
  assert.match(source.commit, /^[0-9a-f]{40}$/);
  for (const f of Object.values(source.files)) assert.ok(existsSync(`brand/${f}`), f);
  assert.match(readFileSync('brand/powered-by-smaltbi.svg', 'utf8'), /viewBox="0 0 172 28"/);
});

test('the default theme loads the Geist web font', () => {
  assert.match(themeCss(BUILTIN_THEMES.smalt!), /@import url\("https:\/\/fonts\.googleapis\.com\/css2\?family=Geist/);
});
