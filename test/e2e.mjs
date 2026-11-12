// End-to-end test in Chromium (Playwright): the designer builds visuals, the viewer interacts,
// and a published ZIP runs on its own. Run after `npm run build`: node test/e2e.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
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

  // ---------------------------------------------------------------- product site (front page)
  // The front page is the VitePress site in docs/, assembled into _site/ by `npm run site`. CI builds it; locally
  // the checks run when _site/ exists (E2E_SITE=1 makes a missing _site/ a failure).
  const siteDir = join(root, '_site');
  if (existsSync(join(siteDir, 'index.html'))) {
    const sitePort = port + 2;
    // The site is built for /smaltbi/ (GitHub Pages): serve it under that path.
    const siteRoot = mkdtempSync(join(tmpdir(), 'smaltbi-pages-'));
    symlinkSync(siteDir, join(siteRoot, 'smaltbi'), 'dir');
    await serve(siteRoot, sitePort);
    const base = `http://localhost:${sitePort}/smaltbi/`;
    const landing = await browser.newPage({ viewport: { width: 1360, height: 900 }, colorScheme: 'light' });
    landing.on('pageerror', (e) => errors.push('site: ' + e.message));
    landing.on('console', (m) => m.type() === 'error' && errors.push('site: ' + m.text()));
    await landing.goto(base);
    await landing.waitForSelector('.VPHero');
    const hero = await landing.evaluate(() => ({
      name: document.querySelector('.VPHero .name')?.textContent,
      // The tagline breaks after "Small. Alternative." on every smalt site (smalt-brand BRAND.md rule 2).
      text: document.querySelector('.VPHero .text')?.innerHTML,
      logo: [...document.querySelectorAll('.VPNavBar img, .VPHero img')].filter((i) => getComputedStyle(i).display !== 'none').every((i) => i.complete && i.naturalWidth > 0),
      // The hero has one button, Getting started; the app opens only from the Demo nav item (BRAND.md rule 12).
      actions: [...document.querySelectorAll('.VPHero .actions a')].map((a) => [a.textContent.trim(), a.getAttribute('href')]),
      // Exactly one of each light / dark pair shows, and it loads. checkVisibility() also counts a hidden ancestor:
      // VitePress hides its footer on pages with a sidebar.
      stage: [...document.querySelectorAll('.sw-stage img')].filter((i) => i.checkVisibility() && i.complete && i.naturalWidth > 0).length === 1,
      endorsement: [...document.querySelectorAll('.VPFooter img, .sw-project img')].filter((i) => i.checkVisibility() && i.complete && i.naturalWidth > 0).length === 1,
    }));
    check(hero.name === 'smaltbi' && hero.text === 'Small. Alternative.<br>Insight.' && hero.logo, `product site: wordmark, tagline and logo (${JSON.stringify(hero)})`);
    check(hero.stage && hero.endorsement, 'product site shows the work-in-progress badge and "A smaltworks project", once each');
    // Every page starts with the work-in-progress badge and ends with one endorsement.
    const doc = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await doc.goto(`${base}guide/`);
    await doc.waitForSelector('.VPDoc .sw-stage img');
    const docBadges = await doc.evaluate(() => {
      const shown = (sel) => [...document.querySelectorAll(sel)].filter((i) => i.checkVisibility() && i.complete && i.naturalWidth > 0).length;
      const stage = document.querySelector('.VPDoc .sw-stage')?.getBoundingClientRect().top ?? 1e9;
      const title = document.querySelector('.VPDoc h1')?.getBoundingClientRect().top ?? 0;
      return { stage: shown('.VPDoc .sw-stage img'), first: stage < title, endorsement: shown('.VPFooter img, .sw-project img') };
    });
    check(docBadges.stage === 1 && docBadges.first && docBadges.endorsement === 1, `doc pages show the work-in-progress badge at the top and one endorsement (${JSON.stringify(docBadges)})`);
    await doc.close();
    check(JSON.stringify(hero.actions) === JSON.stringify([['Getting started', '/smaltbi/guide/']]), `the hero's only button is Getting started (${JSON.stringify(hero.actions)})`);
    // The home page embeds no demo; the Demo nav item, first, opens the designer (smalt-brand BRAND.md, rule 12).
    const demoNav = await landing.evaluate(() => ({
      iframes: document.querySelectorAll('iframe').length,
      first: [...document.querySelectorAll('.VPNavBarMenu a')].map((a) => [a.textContent.trim(), a.getAttribute('href')])[0],
    }));
    check(demoNav.iframes === 0 && demoNav.first?.[0] === 'Demo' && /designer\.html\?report=examples\/sales\/report\.json$/.test(demoNav.first?.[1] ?? ''), `product site: no embedded demo, Demo first in the nav (${JSON.stringify(demoNav)})`);
    // The Demo nav item opens the designer on the sample, not a site 404.
    await landing.click('.VPNavBarMenu a >> nth=0');
    await landing.waitForURL(/designer\.html\?report=/);
    await landing.waitForSelector('.sb-visual .sk-bar', { timeout: 20000 });
    check(true, 'the designer opens from the product site');
    // Old links to the designer at the site root are forwarded.
    await landing.goto(`${base}?report=examples/sales/report.json`);
    await landing.waitForURL(/designer\.html\?report=/);
    check(true, 'old ?report= links at the root forward to the designer');
    await landing.close();
  } else {
    check(!process.env.E2E_SITE, 'product site checks skipped: _site/ is missing (run npm run site)');
  }

  // ---------------------------------------------------------------- Parquet in the browser
  // The engine worker (src/engine/worker.ts) registers smaltql and the plugins: a gzip Parquet file is imported and a
  // Snappy one linked in place.
  {
    const pq = await newPage(browser, { viewport: { width: 1200, height: 700 } });
    pq.on('pageerror', (e) => errors.push('parquet: ' + e.message));
    pq.on('console', (m) => m.type() === 'error' && errors.push('parquet: ' + m.text()));
    await pq.goto(`http://localhost:${port}/viewer.html?report=test/fixtures/parquet-report.json`);
    const ok = await until(pq, () => document.querySelectorAll('.sk-kpi-value').length === 2, undefined, 30000);
    const cards = await pq.evaluate(() => [...document.querySelectorAll('.sk-kpi-value')].map((e) => e.textContent));
    check(ok && cards[0] === '4,000' && cards[1] === '2,000', `Parquet import and link run in the browser engine (${cards})`);
    await pq.close();
  }

  // ---------------------------------------------------------------- designer
  await page.goto(`http://localhost:${port}/designer.html`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`http://localhost:${port}/designer.html?report=examples/sales/report.json`);
  await page.waitForSelector('.sb-visual[data-id=c-cat] .sk-bar', { timeout: 20000 });
  check(true, 'designer opens the sample report');
  // The light / dark / automatic switch: the designer's chrome and its report go dark together, whatever the system
  // setting, and the choice is the one the viewer and the product site share (smaltbi.mode).
  await page.click('.sbd-mode'); // auto -> light
  await page.click('.sbd-mode'); // light -> dark
  const darkDesigner = await until(page, () =>
    document.documentElement.dataset.theme === 'dark' &&
    getComputedStyle(document.querySelector('.sbd-top')).backgroundColor === 'rgb(27, 31, 41)' &&
    getComputedStyle(document.querySelector('.sb-report')).backgroundColor === 'rgb(20, 23, 31)' &&
    localStorage.getItem('smaltbi.mode') === 'dark');
  check(darkDesigner, 'the designer has a light / dark switch that darkens its chrome and the report');
  await page.click('.sbd-mode'); // dark -> auto
  await until(page, () => !document.documentElement.dataset.theme && localStorage.getItem('smaltbi.mode') === 'auto');
  const count = () => page.locator('.sb-page > .sb-visual').count();
  const before = await count();

  // Click a measure with nothing selected: a KPI card appears.
  await page.click('.sbd-canvas', { position: { x: 5, y: 5 } });
  await page.click('.sbd-field:has-text("Units")');
  await until(page, ([n]) => document.querySelectorAll('.sb-page > .sb-visual').length === n, [before + 1]);
  check((await count()) === before + 1, 'clicking a measure adds a card');
  const cardText = await page.locator('.sb-visual.sb-selected .sk-kpi-value').textContent();
  // Visual-type icons are drawn in the Chevron style: solid shapes and one product-colour chip.
  await page.waitForSelector('.sbd-vtype svg');
  const icons = await page.evaluate(() => [...document.querySelectorAll('.sbd-vtype svg')].map((s) => ({ k: s.querySelectorAll('.k').length, strokes: s.querySelectorAll('[stroke]').length })));
  check(icons.length >= 19 && icons.every((i) => i.k <= 1 && i.strokes === 0), `visual gallery shows Chevron-style icons (${icons.length})`);
  check(/\d/.test(cardText ?? ''), `new card shows a value (${cardText})`);

  // Change it into a column chart and add a dimension.
  await page.click('.sbd-vtype[title^="Column chart"]');
  await page.click('.sbd-field:has-text("segment")');
  await until(page, () => document.querySelectorAll('.sb-visual.sb-selected .sk-bar').length === 3);
  const bars = await page.locator('.sb-visual.sb-selected .sk-bar').count();
  check(bars === 3, `changed to a column chart by segment (${bars} bars)`);

  // SQL tab shows the generated SQL.
  await page.click('.sbd-tab:has-text("SQL")');
  const sql = await page.locator('.sbd-sql').textContent();
  check(/GROUP BY "customers"\."segment"/.test(sql ?? ''), 'SQL tab shows the generated query');

  // Undo removes the dimension again.
  // Without the segment axis, the column chart shows a single bar again.
  await page.keyboard.press('Control+z');
  const undone = await until(page, () => document.querySelectorAll('.sb-visual.sb-selected .sk-bar').length === 1);
  check(undone, 'undo removes the added field');

  // Conditional formatting: the selected visual as a table of revenue by category; a rule from the Format tab.
  const cfId = await page.evaluate(() => {
    const id = document.querySelector('.sb-visual.sb-selected').dataset.id;
    const s = window.smaltbi.store;
    const found = s.visual(id);
    s.change('visual', () => Object.assign(found.visual, { type: 'table', fields: { columns: ['products.category'], values: ['sales.Revenue'] } }), id);
    return id;
  });
  await until(page, (id) => document.querySelectorAll(`.sb-visual[data-id="${id}"] tbody tr`).length === 4, cfId);
  await page.click('.sbd-tab:has-text("Format")');
  await page.click('.sbd-add-rule');
  await page.selectOption('.sbd-rule select >> nth=0', 'sales.Revenue');
  await page.selectOption('.sbd-rule select >> nth=2', 'gt');
  await page.locator('.sbd-rule input[type=number]').fill('150000');
  await page.locator('.sbd-rule input[type=number]').press('Enter');
  await page.locator('.sbd-rule input[type=number]').blur();
  await page.selectOption('.sbd-rule select >> nth=4', 'good');
  await page.selectOption('.sbd-rule select >> nth=5', 'up');
  await page.locator('.sbd-rule label.sbd-check input').check();
  const cfCells = await until(page, (id) => document.querySelectorAll(`.sb-visual[data-id="${id}"] td.sk-tone-good.sk-fill`).length === 2, cfId, 10000);
  const cf = await page.evaluate((id) => [...document.querySelectorAll(`.sb-visual[data-id="${id}"] tbody tr`)].map((tr) => [tr.cells[0].textContent, tr.cells[1].className, !!tr.cells[1].querySelector('.sk-cf-icon')]), cfId);
  const rule = await page.evaluate((id) => window.smaltbi.store.visual(id).visual.conditional, cfId);
  check(cfCells && cf.filter(([, cls, icon]) => /sk-tone-good sk-fill/.test(cls) && icon).map(([c]) => c).sort().join() === 'Coffee,Tea' && cf.filter(([, cls]) => /sk-tone/.test(cls)).length === 2, `conditional formatting: revenue above 150,000 is good, filled, with an icon (${JSON.stringify(cf)} ${JSON.stringify(rule)})`);
  // A rule may test a measure the table doesn't show (Orders): it is fetched, not drawn.
  await page.evaluate((id) => {
    const s = window.smaltbi.store;
    s.change('visual', () => (s.visual(id).visual.conditional = [{ apply: 'sales.Revenue', test: 'sales.Orders', op: 'gte', value: 1, tone: 'accent' }]), id);
  }, cfId);
  const byMeasure = await until(page, (id) => document.querySelectorAll(`.sb-visual[data-id="${id}"] td.sk-tone-accent`).length === 4, cfId, 10000);
  const headers = await page.evaluate((id) => [...document.querySelectorAll(`.sb-visual[data-id="${id}"] thead th`)].map((th) => th.textContent), cfId);
  check(byMeasure && headers.length === 2, `conditional formatting by a measure the table doesn't show (${headers})`);
  await page.evaluate((id) => {
    const s = window.smaltbi.store;
    const pg = s.visual(id).page;
    s.change('page', () => (pg.visuals = pg.visuals.filter((v) => v.id !== id)), pg.id);
  }, cfId);

  // Matrix: stepped, a parent row per category with subtotals (and a row total); a caret collapses one.
  const mxId = await page.evaluate(() => {
    const id = document.querySelector('.sb-visual.sb-selected')?.dataset.id ?? document.querySelector('.sb-visual').dataset.id;
    const s = window.smaltbi.store;
    s.change('visual', () => Object.assign(s.visual(id).visual, { type: 'matrix', conditional: undefined, options: {}, layout: { x: 0, y: 40, w: 8, h: 9 }, fields: { rows: ['products.category', 'products.subcategory'], columns: ['stores.channel'], values: ['sales.Orders'] } }), id);
    return id;
  });
  const mx = (sel) => `.sb-visual[data-id="${mxId}"] ${sel}`;
  const stepped = await until(page, (sel) => document.querySelectorAll(sel).length === 4 && [...document.querySelectorAll(sel)].every((tr) => [...tr.querySelectorAll('td.sk-subtotal')].every((td) => td.textContent.trim() !== '')), mx('tr.sk-parent'), 10000);
  const leaves = await page.locator(mx('tbody tr:not(.sk-parent)')).count();
  check(stepped && leaves > 4, `matrix: stepped, 4 categories with subtotals over ${leaves} subcategories`);
  await page.locator(mx('tr.sk-parent .sk-caret')).first().click();
  const collapsed = await until(page, ([sel, n]) => document.querySelectorAll(sel).length < n && document.querySelector(sel.replace(':not(.sk-parent)', '.sk-parent') + ' .sk-caret')?.getAttribute('aria-expanded') === 'false', [mx('tbody tr:not(.sk-parent)'), leaves]);
  await page.locator(mx('tr.sk-parent .sk-caret')).first().click();
  const expanded = await until(page, ([sel, n]) => document.querySelectorAll(sel).length === n, [mx('tbody tr:not(.sk-parent)'), leaves]);
  check(collapsed && expanded, 'matrix: a caret collapses and expands a category');
  await page.evaluate((id) => {
    const s = window.smaltbi.store;
    s.change('visual', () => (s.visual(id).visual.options = { layout: 'tabular' }), id);
  }, mxId);
  const tabular = await until(page, (sel) => /subcategory/i.test(document.querySelector(sel + ' table.sk-matrix:not(.sk-stepped) thead tr:last-child th:nth-child(2)')?.textContent ?? ''), `.sb-visual[data-id="${mxId}"]`);
  check(tabular && !(await page.locator(mx('.sk-parent')).count()), 'matrix: tabular layout, a column per level');
  await page.evaluate((id) => {
    const s = window.smaltbi.store;
    const pg = s.visual(id).page;
    s.change('page', () => (pg.visuals = pg.visuals.filter((v) => v.id !== id)), pg.id);
  }, mxId);

  // Chart axes: a continuous date axis, a reference line added in the Format tab, log scale; small multiples.
  const axId = await page.evaluate(() => {
    const s = window.smaltbi.store;
    const pg = s.visual(document.querySelector('.sb-visual').dataset.id).page;
    const id = 'e2e-axes';
    s.change('page', () => pg.visuals.push({ id, type: 'line', title: 'Axes', options: { xAxis: 'continuous' }, layout: { x: 0, y: 40, w: 8, h: 7 }, fields: { category: ['sales.order_date'], values: ['sales.Revenue'] } }), pg.id);
    return id;
  });
  const ax = (sel) => `.sb-visual[data-id="${axId}"] ${sel}`;
  const timeAxis = await until(page, (sel) => [...document.querySelectorAll(sel)].some((t) => /^Jan 2025$/.test(t.textContent)), ax('.sk-tick.sk-cat'));
  const days = await page.locator(ax('circle.sk-mark')).count();
  check(timeAxis && days > 300, `chart axis: continuous dates with calendar ticks (${days} days)`);
  await page.locator(`.sb-visual[data-id="${axId}"]`).click({ position: { x: 20, y: 12 } });
  await until(page, (id) => document.querySelector(`.sb-visual.sb-selected[data-id="${id}"]`), axId);
  await page.click('.sbd-tab:has-text("Format")');
  await page.click('.sbd-add-refline');
  const refLine = await until(page, ([line, label]) => document.querySelectorAll(line).length === 1 && /^Average: \$\d/.test(document.querySelector(label)?.textContent ?? ''), [ax('line.sk-ref'), ax('text.sk-ref-label')]);
  check(refLine, 'chart axis: a reference line at the average, added from the Format tab');
  await page.selectOption('.sbd-field-row:has(span:text-is("Y axis scale")) select', 'log');
  const logTicks = await until(page, (sel) => [...document.querySelectorAll(sel)].map((t) => t.textContent).join() === '$100,$200,$500,$1K,$2K,$5K,$10K', ax('text.sk-tick:not(.sk-cat)'));
  check(logTicks, 'chart axis: log scale');
  await page.evaluate((id) => {
    const s = window.smaltbi.store;
    s.change('visual', () => Object.assign(s.visual(id).visual, { type: 'column', options: { legend: 'none' }, fields: { category: ['products.category'], values: ['sales.Revenue'], multiples: ['customers.region'] } }), id);
  }, axId);
  const multiples = await until(page, (sel) => document.querySelectorAll(sel + ' .sk-panel').length === 3 && document.querySelectorAll(sel + ' rect.sk-bar').length === 12, `.sb-visual[data-id="${axId}"]`);
  check(multiples, 'small multiples: a panel per region, 4 categories each');
  await page.evaluate((id) => {
    const s = window.smaltbi.store;
    const pg = s.visual(id).page;
    s.change('page', () => (pg.visuals = pg.visuals.filter((v) => v.id !== id)), pg.id);
  }, axId);

  // Designer ergonomics: wells reorder by drag and keyboard, moves keep a field's settings; multi-select; field search.
  const wellIds = await page.evaluate(() => {
    const s = window.smaltbi.store;
    const pg = s.visual(document.querySelector('.sb-visual').dataset.id).page;
    s.change('page', () => pg.visuals.push({ id: 'e2e-wells', type: 'column', layout: { x: 0, y: 40, w: 6, h: 5 }, fields: { category: [{ field: 'products.category', label: 'Cat' }], values: ['sales.Revenue', 'sales.Orders', 'sales.Units'] } }), pg.id);
    return 'e2e-wells';
  });
  const wellFields = () => page.evaluate((id) => JSON.stringify(window.smaltbi.store.visual(id).visual.fields), wellIds);
  await page.locator(`.sb-visual[data-id="${wellIds}"]`).click({ position: { x: 20, y: 12 } });
  await page.click('.sbd-tab:has-text("Build")');
  await until(page, () => document.querySelectorAll('.sbd-well[data-role="values"] > .sbd-chip').length === 3);
  // Drag Units onto the top half of Revenue: it goes first.
  await page.locator('.sbd-well[data-role="values"] > .sbd-chip >> nth=2').dragTo(page.locator('.sbd-well[data-role="values"] > .sbd-chip >> nth=0'), { targetPosition: { x: 20, y: 3 } });
  const reordered = await until(page, (id) => JSON.stringify(window.smaltbi.store.visual(id).visual.fields.values) === '["sales.Units","sales.Revenue","sales.Orders"]', wellIds);
  check(reordered, `field wells: drag to reorder (${await wellFields()})`);
  // Alt+Down moves the focused chip down.
  await page.locator('.sbd-well[data-role="values"] > .sbd-chip >> nth=0').focus();
  await page.keyboard.press('Alt+ArrowDown');
  const keyed = await until(page, (id) => JSON.stringify(window.smaltbi.store.visual(id).visual.fields.values) === '["sales.Revenue","sales.Units","sales.Orders"]', wellIds);
  check(keyed, `field wells: Alt+Down reorders from the keyboard (${await wellFields()})`);
  // Drag the axis field (renamed "Cat") into the legend well: it moves, label kept.
  await page.locator('.sbd-well[data-role="category"] > .sbd-chip').dragTo(page.locator('.sbd-well[data-role="series"]'));
  const moved = await until(page, (id) => {
    const f = window.smaltbi.store.visual(id).visual.fields;
    return !(f.category ?? []).length && JSON.stringify(f.series) === '[{"field":"products.category","label":"Cat"}]';
  }, wellIds);
  check(moved, `field wells: drag between wells keeps the field's label (${await wellFields()})`);
  // Field search from the keyboard: "/" focuses it, typing filters, Down + Enter adds the match to the selected visual.
  await page.locator('.sbd-canvas').click({ position: { x: 3, y: 3 } }).catch(() => {});
  await page.locator(`.sb-visual[data-id="${wellIds}"]`).click({ position: { x: 20, y: 12 } });
  await page.keyboard.press('/');
  const searchFocused = await until(page, () => document.activeElement?.classList.contains('sbd-search'));
  await page.keyboard.type('segment');
  await page.keyboard.press('ArrowDown');
  const fieldFocused = await until(page, () => document.activeElement?.dataset?.ref === 'customers.segment');
  await page.keyboard.press('Enter');
  const searched = await until(page, (id) => JSON.stringify(window.smaltbi.store.visual(id).visual.fields).includes('customers.segment'), wellIds);
  check(searchFocused && fieldFocused && searched, `field search: "/", type, Down, Enter adds the field (${await wellFields()})`);
  await page.locator('.sbd-search').fill('');
  await page.locator('.sbd-search').dispatchEvent('input');
  // Multi-select: with nothing selected, Ctrl-click two fields and add them: one new chart with both.
  await page.evaluate((id) => {
    const s = window.smaltbi.store;
    const pg = s.visual(id).page;
    s.change('page', () => (pg.visuals = pg.visuals.filter((v) => v.id !== id)), pg.id);
  }, wellIds);
  await page.keyboard.press('Escape');
  const before2 = await count();
  await page.locator('.sbd-field[data-ref="stores.channel"]').click({ modifiers: ['ControlOrMeta'] });
  await page.locator('.sbd-field[data-ref="sales.Revenue"]').click({ modifiers: ['ControlOrMeta'] });
  const twoSelected = await until(page, () => document.querySelectorAll('.sbd-field.sbd-selected').length === 2 && /2 fields selected/.test(document.querySelector('.sbd-field-sel')?.textContent ?? ''));
  await page.click('.sbd-field-sel button:has-text("Add")');
  const multiAdded = await until(page, (n) => document.querySelectorAll('.sb-page > .sb-visual').length === n + 1, before2);
  const made = await page.evaluate(() => {
    const v = window.smaltbi.store.visual(document.querySelector('.sb-visual.sb-selected').dataset.id).visual;
    return `${v.type} ${JSON.stringify(v.fields)}`;
  });
  check(twoSelected && multiAdded && made === 'bar {"category":["stores.channel"],"values":["sales.Revenue"]}', `fields: multi-select adds both to one new chart (${made})`);
  await page.keyboard.press('Delete');
  await page.locator('.sbd-field-sel button:has-text("Clear")').click().catch(() => {});

  // Model view: the ER diagram of tables and relationships.
  await page.click('.sbd-seg-btn:has-text("Model")');
  await until(page, () => document.querySelectorAll('.sbd-mv-card').length === 4 && document.querySelectorAll('.sbd-mv-rel').length === 3);
  check((await page.locator('.sbd-mv-card').count()) === 4 && (await page.locator('.sbd-mv-rel').count()) === 3, 'model view shows 4 tables and 3 relationships');
  const rels = () => page.evaluate(() => window.smaltbi.store.report.model.relationships.map((r) => `${r.from}>${r.to}`));
  // Select the stores relationship by its line and delete it.
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
  // Row counts are cached per data load: a re-render (clicking a line) shows them at once
  // instead of blanking every card and counting again.
  await until(page, () => [...document.querySelectorAll('.sbd-mv-count')].every((c) => /rows/.test(c.textContent)));
  const countsAfterClick = await page.evaluate(() => {
    document.querySelector('.sbd-mv-rel[data-rel="0"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return [...document.querySelectorAll('.sbd-mv-count')].map((c) => c.textContent);
  });
  check(countsAfterClick.length === 4 && countsAfterClick.every((t) => /rows/.test(t)), `row counts stay visible when the diagram re-renders (${countsAfterClick})`);

  // An ambiguous model is an error, not a guess (ADR 0004, decision 9): add a second path
  // sales → stores → customers, look at a visual that crosses it, then undo.
  await page.evaluate(() => window.smaltbi.store.change('model', (r) => r.model.relationships.push({ from: 'stores.id', to: 'customers.id' })));
  await until(page, () => /ambiguous path/.test(document.querySelector('.sbd-mv-warn')?.textContent ?? ''));
  await page.click('.sbd-seg-btn:has-text("Report")');
  await page.click('.sbd-page-tab:has-text("Customers")');
  const ambiguous = await until(page, () => /more than one relationship path/.test(document.querySelector('.sb-visual[data-id=cu-country] .sb-visual-body')?.textContent ?? ''));
  check(ambiguous, 'a visual over an ambiguous path explains the problem instead of guessing');
  await page.keyboard.press('Control+z');
  const restored = await until(page, () => document.querySelectorAll('.sb-visual[data-id=cu-country] .sk-bar').length > 0);
  check(restored, 'undoing the extra relationship restores the visual');
  await page.click('.sbd-page-tab:has-text("Overview")');
  await page.click('.sbd-seg-btn:has-text("Model")');
  await until(page, () => document.querySelectorAll('.sbd-mv-card').length === 4);

  // Preview from Model view (review on #5): Delete must not remove the relationship that was
  // selected in the hidden diagram, and returning must bring back the diagram and both side panes.
  const relsBefore = (await rels()).length;
  await page.locator('.sbd-mv-rel[data-rel="0"] .sbd-mv-hit').dispatchEvent('pointerdown');
  await until(page, () => !!document.querySelector('.sbd-mv-relcard'));
  await page.click('.sbd-tbtn:has-text("Preview")');
  await until(page, () => document.querySelector('.sbd-app')?.classList.contains('sbd-preview'));
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  check((await rels()).length === relsBefore, `Delete in Preview leaves relationships alone (${relsBefore} → ${(await rels()).length})`);
  const modeSwitches = await page.locator('.sbd-mode, .sbv-mode').count();
  check(modeSwitches === 1, `Preview shows one light / dark switch, the top bar's (${modeSwitches})`);
  await page.click('.sbd-tbtn:has-text("Edit")');
  const panesBack = await until(page, () => {
    const visible = (sel) => (document.querySelector(sel)?.getBoundingClientRect().width ?? 0) > 0;
    return !document.querySelector('.sbd-app').classList.contains('sbd-preview') && visible('.sbd-left') && visible('.sbd-right') && !!document.querySelector('.sbd-mv-card');
  });
  check(panesBack, 'returning from Preview shows the diagram, the Fields pane and the side panel');
  check(!(await page.locator('.sbv-bar').count()), 'the preview bar is gone after returning');

  // Back to the report: visuals still query through the relationships.
  await page.click('.sbd-seg-btn:has-text("Report")');
  await until(page, () => document.querySelectorAll('.sb-visual[data-id=c-cat] .sk-bar').length === 4);
  check((await page.locator('.sb-visual[data-id=c-cat] .sk-bar').count()) === 4, 'report renders again after editing the model');

  // Add date table (ADR 0006): a calendar related to the sales dates, with fiscal years from July and ISO weeks.
  await page.click('.sbd-seg-btn:has-text("Model")');
  await page.click('.sbd-mv-datetable');
  await page.selectOption('.sbd-datetable select >> nth=0', 'sales.order_date');
  await page.selectOption('.sbd-datetable select >> nth=1', '7');
  await page.locator('.sbd-datetable label.sbd-check input').check();
  await page.click('.sk-dialog-foot button:has-text("Add date table")');
  const calendarCard = await until(page, () => !!document.querySelector('.sbd-mv-card[data-table=calendar]'), undefined, 30000);
  const dt = await page.evaluate(() => {
    const m = window.smaltbi.store.report.model;
    return { spec: m.dateTable, rel: (m.relationships ?? []).some((r) => r.from === 'sales.order_date' && r.to === 'calendar.date'), hier: (m.hierarchies ?? []).filter((x) => x.table === 'calendar').map((x) => x.name) };
  });
  check(calendarCard && dt.rel && dt.spec?.fiscalStart === 7 && dt.spec?.isoWeeks && dt.hier.join() === 'Calendar,Fiscal calendar,ISO weeks', `Add date table builds a related calendar with its hierarchies (${JSON.stringify(dt)})`);
  // A visual over the calendar: revenue by fiscal year (FY2024 … FY2026 around 2024-01 … 2025-11).
  await page.click('.sbd-seg-btn:has-text("Report")');
  await page.evaluate(() => {
    const s = window.smaltbi.store;
    const pg = s.report.pages[0];
    s.change('page', () => pg.visuals.push({ id: 'c-fy', type: 'column', title: 'Revenue by fiscal year', layout: { x: 0, y: 40, w: 6, h: 4 }, fields: { category: ['calendar.Fiscal calendar'], values: ['sales.Revenue'] } }), pg.id);
  });
  const fyBars = await until(page, () => document.querySelectorAll('.sb-visual[data-id=c-fy] .sk-bar').length === 3, undefined, 20000);
  const fyLabels = await page.evaluate(() => [...document.querySelectorAll('.sb-visual[data-id=c-fy] .sk-tick.sk-cat')].map((t) => t.textContent));
  check(fyBars && fyLabels.join() === 'FY2024,FY2025,FY2026', `a visual queries through the date table (${fyLabels})`);
  await page.evaluate(() => {
    const s = window.smaltbi.store;
    const pg = s.report.pages[0];
    s.change('page', () => (pg.visuals = pg.visuals.filter((v) => v.id !== 'c-fy')), pg.id);
  });

  // The measure editor (smaltkit's SQL editor): highlighting, completion from the model, reference warnings, errors.
  await page.locator('.sbd-field:has(.sbd-flabel:text-is("Avg Order Value"))').click({ button: 'right' });
  await page.click('.sk-menu-item:has-text("Edit measure…")');
  await page.waitForSelector('.sk-dialog .sk-editor .sk-ed-input');
  const editorHl = await page.locator('.sk-dialog .sk-ed-hl').innerHTML();
  const input = page.locator('.sk-dialog .sk-ed-input');
  await input.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' + [Gro');
  const completes = await until(page, () => [...document.querySelectorAll('.sk-dialog .sk-ed-complete:not([hidden]) [data-i]')].some((li) => /Gross Margin/.test(li.textContent)), undefined, 5000);
  // Typing on narrows the list (Escape would close the dialog if the list had already gone).
  await page.keyboard.type('ss Mragin]');
  const warned = await until(page, () => [...document.querySelectorAll('.sk-dialog mark.sk-ed-warn')].some((m) => /Mragin/.test(m.textContent)), undefined, 5000);
  check(/sk-tk-/.test(editorHl) && completes && warned, `measure editor: highlighting, [ completes measures, unknown references are marked (${completes}, ${warned})`);
  // Testing a broken expression marks the error and keeps the dialog open; Cancel leaves the measure as it was.
  await input.fill('SUM(sales.quanity)');
  await page.keyboard.press('ControlOrMeta+Enter');
  const errMarked = await until(page, () => !!document.querySelector('.sk-dialog mark.sk-ed-err') && /quanity/.test(document.querySelector('.sk-dialog .sbd-test')?.textContent ?? ''), undefined, 10000);
  await page.click('.sk-dialog-foot button:has-text("Cancel")');
  const aov = await page.evaluate(() => window.smaltbi.store.report.model.measures.find((m) => m.name === 'Avg Order Value').sql);
  check(errMarked && aov === '[Revenue] / NULLIF([Orders], 0)', `measure editor: a failed test marks the error; Cancel keeps the measure (${errMarked}, ${aov})`);

  // Quick measure (time intelligence): Revenue, same period last year, from the Fields pane's menu.
  await page.locator('.sbd-field:has(.sbd-flabel:text-is("Revenue"))').click({ button: 'right' });
  await page.click('.sk-menu-item:has-text("Quick measure…")');
  await page.selectOption('.sbd-quick select >> nth=1', 'py');
  const quickName = await page.locator('.sbd-quick input:not([type=number])').inputValue();
  await page.click('.sk-dialog-foot button:has-text("Add measure")');
  await until(page, () => (window.smaltbi.store.report.model.measures ?? []).some((m) => m.time?.calc === 'py'));
  await page.evaluate(() => {
    const s = window.smaltbi.store;
    const pg = s.report.pages[0];
    s.change('page', () => pg.visuals.push({ id: 't-ly', type: 'table', layout: { x: 0, y: 40, w: 6, h: 4 }, fields: { columns: ['calendar.year'], values: ['sales.Revenue', 'sales.Revenue LY'] }, sort: [{ by: 'columns:0', dir: 'asc' }] }), pg.id);
  });
  await until(page, () => document.querySelectorAll('.sb-visual[data-id=t-ly] tbody tr').length === 2, undefined, 20000);
  const ly = await page.evaluate(() => [...document.querySelectorAll('.sb-visual[data-id=t-ly] tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent)));
  check(quickName === 'Revenue LY' && ly.length === 2 && ly[0][2] === '(Blank)' && ly[1][2] === ly[0][1], `a quick measure shows last year's revenue beside this year's (${quickName}: ${JSON.stringify(ly)})`);
  await page.evaluate(() => {
    const s = window.smaltbi.store;
    const pg = s.report.pages[0];
    s.change('page', () => (pg.visuals = pg.visuals.filter((v) => v.id !== 't-ly')), pg.id);
  });

  // Theme: switch to Midnight.
  await page.click('.sbd-tbtn:has-text("Theme")');
  await page.click('.sbd-theme-card:has-text("Midnight")');
  await page.click('.sk-dialog-foot button:has-text("Use this theme")');
  await until(page, () => getComputedStyle(document.querySelector('.sb-report')).backgroundColor === 'rgb(11, 13, 18)');
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.sb-report')).backgroundColor);
  check(bg === 'rgb(11, 13, 18)', `theme applied (${bg})`);

  // Brand (stenhoor/smalt-brand copies in brand/): the designer logo and favicon load.
  const logo = await page.evaluate(() => [...document.querySelectorAll('.sbd-logo img')].map((i) => i.complete && i.naturalWidth > 0));
  check(logo.length === 4 && logo.every(Boolean), `designer logo images load (${logo})`);
  // The designer chrome takes its colours from the brand tokens (brand/tokens.css).
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { primary: cs.getPropertyValue('--primary').trim(), accent: getComputedStyle(document.querySelector('.sbd-tbtn.sbd-primary')).backgroundColor };
  });
  check(tokens.primary !== '' && tokens.accent === 'rgb(0, 51, 153)', `designer uses the brand tokens (${JSON.stringify(tokens)})`);
  check((await page.getAttribute('link[rel=icon]', 'href')) === 'brand/favicon-32.svg', 'designer has the smaltbi favicon');

  // The "Powered by" badge can be switched off per report in the Publish dialog.
  const branding = () => page.evaluate(() => window.smaltbi.store.report.branding?.poweredBy);
  await page.click('.sbd-tbtn:has-text("Publish")');
  await page.locator('.sk-dialog label:has-text("Powered by") input').uncheck();
  const off = await branding();
  await page.locator('.sk-dialog label:has-text("Powered by") input').check();
  const on = await branding();
  await page.click('.sk-dialog-foot button:has-text("Cancel")');
  check(off === false && on === undefined, `the Publish dialog turns the badge off and on (${off} → ${on})`);

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
  viewer.on('console', (m) => m.type() === 'error' && errors.push('viewer: ' + m.text()));
  await viewer.goto(`http://localhost:${port2}/`);
  await viewer.waitForSelector('.sb-visual[data-id=c-cat] .sk-bar', { timeout: 20000 });
  check(true, 'the published site renders on its own');
  // count() does not wait: wait for the cards to render first (issue #4).
  await until(viewer, (sel) => document.querySelectorAll(sel).length >= 4, '.sk-kpi-value');
  const units = await viewer.locator('.sk-kpi-value').count();
  check(units >= 4, `published report has its cards (${units})`);
  // The header carries the smaltbi mark, and the colour-mode button an SVG icon instead of a glyph.
  const header = await viewer.evaluate(() => {
    const img = [...document.querySelectorAll('.sbv-mark img')].find((i) => getComputedStyle(i).display !== 'none');
    const btn = document.querySelector('.sbv-mode');
    return { mark: !!img && img.complete && img.naturalWidth > 0, icon: !!btn?.querySelector('svg'), text: btn?.textContent };
  });
  check(header.mark && header.icon && header.text === "Auto", `published report header shows the smaltbi mark and the mode icon (${JSON.stringify(header)})`);
  await viewer.click('.sbv-mode');
  await viewer.click('.sbv-mode');
  const darkHead = await viewer.evaluate(() => {
    const img = [...document.querySelectorAll('.sbv-mark img')].find((i) => getComputedStyle(i).display !== 'none');
    return { src: img?.getAttribute('src'), text: document.querySelector('.sbv-mode')?.textContent };
  });
  check(darkHead.src === 'brand/scatter-mark-on-dark.svg' && darkHead.text === 'Dark', `dark mode switches to the on-dark mark (${JSON.stringify(darkHead)})`);
  await viewer.click('.sbv-mode'); // back to auto
  // The published site carries the brand files: the badge links to smaltbi and its image loads.
  const badge = await viewer.evaluate(() => {
    const a = document.querySelector('.sbv-badge');
    const img = [...(a?.querySelectorAll('img') ?? [])].find((i) => getComputedStyle(i).display !== 'none');
    return { href: a?.getAttribute('href'), alt: img?.alt, loaded: !!img && img.complete && img.naturalWidth > 0 };
  });
  check(badge.href === 'https://github.com/stenhoor/smaltbi' && badge.alt === 'Powered by smaltbi' && badge.loaded, `published report shows the "Powered by smaltbi" badge (${JSON.stringify(badge)})`);
  const favicon = await viewer.evaluate(async () => (await fetch(document.querySelector('link[rel=icon]').href)).status);
  check(favicon === 200, `published site serves its favicon (${favicon})`);

  // Cross-filter: click the "Europe" slicer button, the Orders card changes.
  const orders = () => viewer.locator('.sb-visual[data-id=k-orders] .sk-kpi-value').textContent();
  const o1 = await orders();
  await viewer.click('.sk-chip:has-text("Europe")');
  await until(viewer, (before) => document.querySelector('.sb-visual[data-id=k-orders] .sk-kpi-value')?.textContent !== before, o1);
  const o2 = await orders();
  check(o1 !== o2, `slicer filters other visuals (${o1} → ${o2})`);
  check(viewer.url().includes('#s='), 'view state is in the URL');

  // Drill down on the date column chart, once the slicer's refreshes have finished (a redraw
  // between the two clicks of a double-click would swallow it).
  await until(viewer, () => !document.querySelector('.sb-loading'));
  await viewer.dblclick('.sb-visual[data-id=c-date] .sk-bar >> nth=0');
  await until(viewer, () => document.querySelector('.sb-visual[data-id=c-date] .sb-drill-level')?.textContent === 'Quarter');
  const level = await viewer.locator('.sb-visual[data-id=c-date] .sb-drill-level').textContent();
  check(level === 'Quarter', `drill down to ${level}`);

  // Drill-through.
  await viewer.click('.sbv-tab:has-text("Customers")');
  await viewer.waitForSelector('.sb-visual[data-id=cu-country] .sk-bar');
  await until(viewer, () => !document.querySelector('.sb-loading'));
  await viewer.click('.sb-visual[data-id=cu-country] .sk-bar >> nth=0', { button: 'right' });
  await viewer.click('.sk-menu-item:has-text("Drill through")');
  await viewer.waitForSelector('.sb-drillbar');
  check(true, 'drill-through opens the detail page');

  // Leaving a page while its visuals are still querying must not draw them off screen (a
  // detached donut used to render with a negative height). Errors surface in 'no page errors'.
  await viewer.click('.sbv-tab:has-text("Overview")');
  await viewer.waitForSelector('.sb-visual[data-id=c-channel] .sk-slice');
  for (let i = 0; i < 15; i++) {
    await viewer.click(`.sk-chip >> nth=${i % 4}`);
    await viewer.click('.sbv-tab:has-text("Products")');
    await viewer.click('.sbv-tab:has-text("Overview")');
  }
  await until(viewer, () => !document.querySelector('.sb-loading') && !!document.querySelector('.sb-visual[data-id=c-channel] .sk-slice'));
  check(true, 'switching pages while visuals load');

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
