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

// E2E_CPU_THROTTLE=4 slows the browser's CPU 4x (Chrome DevTools), to shake out timing races.
const throttle = Number(process.env.E2E_CPU_THROTTLE || 0);
async function newPage(browser, opts) {
  const p = await browser.newPage(opts);
  if (throttle > 1) {
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }
  return p;
}

// Wait until a condition holds in the page (instead of sleeping and hoping). Returns false on
// timeout, so the following check() reports the failure with its own message.
async function until(page, fn, arg, timeout = 15000) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 100 });
    return true;
  } catch {
    return false;
  }
}

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
};

await serve(root, port);
const browser = await chromium.launch();
try {
  const page = await newPage(browser, { viewport: { width: 1440, height: 900 }, acceptDownloads: true });
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
  await until(page, ([n]) => document.querySelectorAll('.sb-page > .sb-visual').length === n, [before + 1]);
  check((await count()) === before + 1, 'clicking a measure adds a card');
  const cardText = await page.locator('.sb-visual.sb-selected .sb-kpi-value').textContent();
  check(/\d/.test(cardText ?? ''), `new card shows a value (${cardText})`);

  // Change it into a column chart and add a dimension.
  await page.click('.sbd-vtype[title^="Column chart"]');
  await page.click('.sbd-field:has-text("segment")');
  await until(page, () => document.querySelectorAll('.sb-visual.sb-selected .sb-bar').length === 3);
  const bars = await page.locator('.sb-visual.sb-selected .sb-bar').count();
  check(bars === 3, `changed to a column chart by segment (${bars} bars)`);

  // SQL tab shows the generated SQL.
  await page.click('.sbd-tab:has-text("SQL")');
  const sql = await page.locator('.sbd-sql').textContent();
  check(/GROUP BY "customers"\."segment"/.test(sql ?? ''), 'SQL tab shows the generated query');

  // Undo removes the dimension again.
  // Without the segment axis, the column chart shows a single bar again.
  await page.keyboard.press('Control+z');
  const undone = await until(page, () => document.querySelectorAll('.sb-visual.sb-selected .sb-bar').length === 1);
  check(undone, 'undo removes the added field');

  // Model view: the ER diagram of tables and relationships.
  await page.click('.sbd-seg-btn:has-text("Model")');
  await until(page, () => document.querySelectorAll('.sbd-mv-card').length === 4 && document.querySelectorAll('.sbd-mv-rel').length === 3);
  check((await page.locator('.sbd-mv-card').count()) === 4 && (await page.locator('.sbd-mv-rel').count()) === 3, 'model view shows 4 tables and 3 relationships');
  const rels = () => page.evaluate(() => window.smaltbi.store.report.model.relationships.map((r) => `${r.from}>${r.to}`));
  // Select the stores relationship by its line, delete it, undo.
  const storeRel = (await rels()).indexOf('sales.store_id>stores.id');
  await page.locator(`.sbd-mv-rel[data-rel="${storeRel}"] .sbd-mv-hit`).dispatchEvent('pointerdown');
  await until(page, () => /sales\.store_id/.test(document.querySelector('.sbd-mv-relcard')?.textContent ?? ''));
  check(/sales\.store_id/.test((await page.locator('.sbd-mv-relcard').textContent()) ?? ''), 'clicking a line selects the relationship');
  await page.click('.sbd-btn.sbd-danger:has-text("Delete")');
  await until(page, () => document.querySelectorAll('.sbd-mv-rel').length === 2);
  check((await rels()).length === 2, 'a relationship can be deleted');
  // Re-create it by dragging sales.store_id onto stores.id.
  const src = await page.locator('.sbd-mv-card[data-table=sales] .sbd-mv-col[data-col=store_id]').boundingBox();
  const dst = await page.locator('.sbd-mv-card[data-table=stores] .sbd-mv-col[data-col=id]').boundingBox();
  await page.mouse.move(src.x + 20, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move((src.x + dst.x) / 2, (src.y + dst.y) / 2, { steps: 5 });
  await page.mouse.move(dst.x + 30, dst.y + dst.height / 2, { steps: 5 });
  await page.mouse.up();
  await until(page, () => document.querySelectorAll('.sbd-mv-rel').length === 3);
  check((await rels()).includes('sales.store_id>stores.id'), 'dragging a column onto a key creates the relationship (many → one)');
  // Move a card: its position is saved in the report.
  const head = await page.locator('.sbd-mv-card[data-table=products] .sbd-mv-head').boundingBox();
  await page.mouse.move(head.x + 40, head.y + 10);
  await page.mouse.down();
  await page.mouse.move(head.x + 40, head.y + 130, { steps: 5 });
  await page.mouse.up();
  const layout = await page.evaluate(() => window.smaltbi.store.report.model.layout?.products);
  check(!!layout, `moving a table saves its position (${JSON.stringify(layout)})`);
  // Back to the report: visuals still query through the relationships.
  await page.click('.sbd-seg-btn:has-text("Report")');
  await until(page, () => document.querySelectorAll('.sb-visual[data-id=c-cat] .sb-bar').length === 4);
  check((await page.locator('.sb-visual[data-id=c-cat] .sb-bar').count()) === 4, 'report renders again after editing the model');

  // Theme: switch to Midnight.
  await page.click('.sbd-tbtn:has-text("Theme")');
  await page.click('.sbd-theme-card:has-text("Midnight")');
  await page.click('.sk-dialog-foot button:has-text("Use this theme")');
  await until(page, () => getComputedStyle(document.querySelector('.sb-report')).backgroundColor === 'rgb(11, 13, 18)');
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
  const viewer = await newPage(browser, { viewport: { width: 1280, height: 900 } });
  viewer.on('pageerror', (e) => errors.push('viewer: ' + e.message));
  await viewer.goto(`http://localhost:${port2}/`);
  await viewer.waitForSelector('.sb-visual[data-id=c-cat] .sb-bar', { timeout: 20000 });
  check(true, 'the published site renders on its own');
  // count() does not wait: wait for the cards to render first (issue #4).
  await until(viewer, (sel) => document.querySelectorAll(sel).length >= 4, '.sb-kpi-value');
  const units = await viewer.locator('.sb-kpi-value').count();
  check(units >= 4, `published report has its cards (${units})`);

  // Cross-filter: click the "Europe" slicer button, the Orders card changes.
  const orders = () => viewer.locator('.sb-visual[data-id=k-orders] .sb-kpi-value').textContent();
  const o1 = await orders();
  await viewer.click('.sb-chip:has-text("Europe")');
  await until(viewer, (before) => document.querySelector('.sb-visual[data-id=k-orders] .sb-kpi-value')?.textContent !== before, o1);
  const o2 = await orders();
  check(o1 !== o2, `slicer filters other visuals (${o1} → ${o2})`);
  check(viewer.url().includes('#s='), 'view state is in the URL');

  // Drill down on the date column chart, once the slicer's refreshes have finished (a redraw
  // between the two clicks of a double-click would swallow it).
  await until(viewer, () => !document.querySelector('.sb-loading'));
  await viewer.dblclick('.sb-visual[data-id=c-date] .sb-bar >> nth=0');
  await until(viewer, () => document.querySelector('.sb-visual[data-id=c-date] .sb-drill-level')?.textContent === 'Quarter');
  const level = await viewer.locator('.sb-visual[data-id=c-date] .sb-drill-level').textContent();
  check(level === 'Quarter', `drill down to ${level}`);

  // Drill-through.
  await viewer.click('.sbv-tab:has-text("Customers")');
  await viewer.waitForSelector('.sb-visual[data-id=cu-country] .sb-bar');
  await until(viewer, () => !document.querySelector('.sb-loading'));
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
