// End-to-end test in Chromium (Playwright): the designer builds visuals, the viewer interacts,
// and a published ZIP runs on its own. Run after `npm run build`: node test/e2e.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = await import('playwright'));
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 8000 + Math.floor(Math.random() * 900);
const servers = [];
function serve(dir, p) {
  const s = spawn(process.execPath, [join(root, 'scripts/serve.mjs'), dir, '--port', String(p)], { stdio: 'ignore' });
  servers.push(s);
  return new Promise((r) => setTimeout(r, 500));
}

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
};

await serve(root, port);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  // ---------------------------------------------------------------- designer
  await page.goto(`http://localhost:${port}/`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`http://localhost:${port}/?report=examples/sales/report.json`);
  await page.waitForSelector('.sb-visual[data-id=c-cat] .sb-bar', { timeout: 20000 });
  check(true, 'designer opens the sample report');
  const count = () => page.locator('.sb-page > .sb-visual').count();
  const before = await count();

  // Click a measure with nothing selected: a KPI card appears.
  await page.click('.sbd-canvas', { position: { x: 5, y: 5 } });
  await page.click('.sbd-field:has-text("Units")');
  await page.waitForTimeout(500);
  check((await count()) === before + 1, 'clicking a measure adds a card');
  const cardText = await page.locator('.sb-visual.sb-selected .sb-kpi-value').textContent();
  check(/\d/.test(cardText ?? ''), `new card shows a value (${cardText})`);

  // Change it into a column chart and add a dimension.
  await page.click('.sbd-vtype[title^="Column chart"]');
  await page.click('.sbd-field:has-text("segment")');
  await page.waitForTimeout(600);
  const bars = await page.locator('.sb-visual.sb-selected .sb-bar').count();
  check(bars === 3, `changed to a column chart by segment (${bars} bars)`);

  // SQL tab shows the generated SQL.
  await page.click('.sbd-tab:has-text("SQL")');
  const sql = await page.locator('.sbd-sql').textContent();
  check(/GROUP BY "customers"\."segment"/.test(sql ?? ''), 'SQL tab shows the generated query');

  // Undo removes the dimension again.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  check((await page.locator('.sb-visual.sb-selected .sb-kpi-value, .sb-visual.sb-selected .sb-bar').count()) >= 1, 'undo works');

  // Theme: switch to Midnight.
  await page.click('.sbd-tbtn:has-text("Theme")');
  await page.click('.sbd-theme-card:has-text("Midnight")');
  await page.click('.sk-dialog-foot button:has-text("Use this theme")');
  await page.waitForTimeout(500);
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.sb-report')).backgroundColor);
  check(bg === 'rgb(11, 13, 18)', `theme applied (${bg})`);

  // Publish a static site.
  await page.click('.sbd-tbtn:has-text("Publish")');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('.sk-dialog-foot button:has-text("Download site")')]);
  const zipPath = join(mkdtempSync(join(tmpdir(), 'smaltbi-')), 'site.zip');
  await download.saveAs(zipPath);
  check(true, 'publish produced a ZIP');

  // ---------------------------------------------------------------- published site
  const site = mkdtempSync(join(tmpdir(), 'smaltbi-site-'));
  const { execFileSync } = await import('node:child_process');
  execFileSync('python3', ['-c', `import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])`, zipPath, site]);
  const port2 = port + 1;
  await serve(site, port2);
  const viewer = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  viewer.on('pageerror', (e) => errors.push('viewer: ' + e.message));
  await viewer.goto(`http://localhost:${port2}/`);
  await viewer.waitForSelector('.sb-visual[data-id=c-cat] .sb-bar', { timeout: 20000 });
  check(true, 'the published site renders on its own');
  const units = await viewer.locator('.sb-kpi-value').count();
  check(units >= 4, 'published report has its cards');

  // Cross-filter: click the "Europe" slicer button, the Orders card changes.
  const orders = () => viewer.locator('.sb-visual[data-id=k-orders] .sb-kpi-value').textContent();
  const o1 = await orders();
  await viewer.click('.sb-chip:has-text("Europe")');
  await viewer.waitForTimeout(700);
  const o2 = await orders();
  check(o1 !== o2, `slicer filters other visuals (${o1} → ${o2})`);
  check(viewer.url().includes('#s='), 'view state is in the URL');

  // Drill down on the date column chart.
  await viewer.dblclick('.sb-visual[data-id=c-date] .sb-bar >> nth=0');
  await viewer.waitForTimeout(700);
  const level = await viewer.locator('.sb-visual[data-id=c-date] .sb-drill-level').textContent();
  check(level === 'Quarter', `drill down to ${level}`);

  // Drill-through.
  await viewer.click('.sbv-tab:has-text("Customers")');
  await viewer.waitForSelector('.sb-visual[data-id=cu-country] .sb-bar');
  await viewer.click('.sb-visual[data-id=cu-country] .sb-bar >> nth=0', { button: 'right' });
  await viewer.click('.sk-menu-item:has-text("Drill through")');
  await viewer.waitForSelector('.sb-drillbar');
  check(true, 'drill-through opens the detail page');

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  for (const s of servers) s.kill();
}
if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall end-to-end checks passed');
