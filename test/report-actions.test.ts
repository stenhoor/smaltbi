// The agent's report actions (src/agent/report-actions.ts), on the sample report and its engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/visuals/index.js';
import { checkActions, defaultGrants, grants as checkGrants, inputProblem, memoryLog, runAgent, type Action, type Gateway, type Grants, type StreamEvent } from '@smaltworks/smaltai';
import { reportActions, WITHHELD } from '../src/agent/report-actions.js';
import { DocStore } from '../src/designer/store.js';
import { EditError, findPage, findVisual } from '../src/core/edits.js';
import { BUILTIN_THEMES } from '../src/theme/theme.js';
import type { Report } from '../src/core/types.js';
import { sampleSession } from './helpers.js';

const session = await sampleSession();

/** A fresh copy of the sample report in a store, its actions, and the grants they read. */
function setup(given: Partial<Grants['data']> = {}) {
  const store = new DocStore(structuredClone(session.report), '');
  let g: Grants = checkGrants({ data: given });
  const actions = reportActions({
    store,
    schema: () => session.schema,
    notUnique: () => new Set(),
    run: (sql) => session.runner.run(sql),
    theme: () => BUILTIN_THEMES.smalt!,
    grants: async () => g,
    database: 'sales',
  });
  const run = async (name: string, input: Record<string, unknown> = {}) => {
    const action = actions.find((a) => a.name === name)!;
    const problem = inputProblem(action.inputSchema, input);
    if (problem) throw new Error(`schema: ${problem}`);
    return action.run(input, { signal: new AbortController().signal });
  };
  return { store, actions, run, setGrants: (next: Grants) => (g = next) };
}
const r = (s: { store: DocStore }): Report => s.store.report;
const firstPage = (s: { store: DocStore }) => r(s).pages[0]!;

test('every action is declared as smaltai checks it, with schemas in the subset smaltai checks', () => {
  const { actions } = setup();
  checkActions(actions);
  const writes = actions.filter((a) => a.kind === 'write');
  assert.ok(writes.length >= 15);
  for (const a of writes) {
    assert.equal(a.grantedByDefault, false, `${a.name} asks first until the user allows it`);
    assert.equal(a.undoable, true, `${a.name} can be undone`);
  }
  for (const a of actions.filter((x) => x.kind === 'read')) assert.equal(a.reads, 'schema', `${a.name} reads names only`);
});

test('reading: the report outline, the tables, the visual types', async () => {
  const s = setup();
  const o = (await s.run('get_report')) as { name: string; pages: { id: string; visuals: { id: string; type: string }[] }[]; model: { measures: { name: string }[] } };
  assert.equal(o.name, r(s).name);
  assert.deepEqual(o.pages.map((p) => p.id), r(s).pages.map((p) => p.id));
  assert.ok(o.pages[0]!.visuals.some((v) => v.id === 'c-cat' && v.type === 'bar'));
  assert.ok(o.model.measures.some((m) => m.name === 'Revenue'));
  const t = (await s.run('list_tables')) as { name: string; columns: { name: string }[]; measures: string[] }[];
  const sales = t.find((x) => x.name === 'sales')!;
  assert.ok(sales.columns.some((c) => c.name === 'quantity') && sales.measures.includes('Revenue'));
  const types = (await s.run('list_visual_types')) as { type: string; roles: { name: string; kind: string }[] }[];
  assert.ok(types.find((x) => x.type === 'bar')!.roles.some((x) => x.kind === 'measure'));
});

test('what the user excluded is never shown, and cannot be used', async () => {
  const s = setup({ excludeTables: ['stores'], excludeColumns: ['sales.discount'] });
  const t = (await s.run('list_tables')) as { name: string; columns: { name: string }[] }[];
  assert.equal(t.some((x) => x.name === 'stores'), false);
  assert.equal(t.find((x) => x.name === 'sales')!.columns.some((c) => c.name === 'discount'), false);
  const o = JSON.stringify(await s.run('get_report'));
  assert.equal(/stores\.|sales\.discount/.test(o), false, 'no excluded name in the outline');
  assert.ok(o.includes(WITHHELD), 'what refers to them is withheld');
  await assert.rejects(s.run('add_visual', { page: firstPage(s).id, type: 'card', fields: { values: ['sales.discount'] } }), /no field sales\.discount/);
  await assert.rejects(s.run('add_filter', { scope: 'report', filter: { field: 'stores.region', op: 'in', values: ['North'] } }), /no field stores\.region/);
  await assert.rejects(s.run('edit_table', { table: 'stores', hidden: true }), /no table stores/);
  await assert.rejects(s.run('set_visual_sql', { visual: 'c-cat', sql: 'SELECT region, COUNT(*) FROM stores GROUP BY 1' }), /names a table or column the user excluded/);
  await assert.rejects(s.run('set_visual_sql', { visual: 'c-cat', sql: 'SELECT SUM(discount) FROM sales' }), /names a table or column the user excluded/);
});

test('pages: add, edit, move, duplicate, remove; a report keeps one page', async () => {
  const s = setup();
  const n = r(s).pages.length;
  const { page } = (await s.run('add_page', { name: 'Trends' })) as { page: string };
  assert.equal(findPage(r(s), page)!.name, 'Trends');
  await s.run('edit_page', { page, name: 'Trend lines', hidden: true, size: { preset: 'a4', landscape: true }, rows: 30, drillthrough: ['products.category'] });
  assert.deepEqual(
    (({ name, hidden, size, layout, drillthrough }) => ({ name, hidden, size, layout, drillthrough }))(findPage(r(s), page)!),
    { name: 'Trend lines', hidden: true, size: { preset: 'a4', landscape: true }, layout: { rows: 30 }, drillthrough: ['products.category'] },
  );
  await s.run('edit_page', { page, size: null, drillthrough: [] });
  assert.equal(findPage(r(s), page)!.size, undefined);
  assert.deepEqual(findPage(r(s), page)!.drillthrough, []);
  await s.run('move_page', { page, by: -100 });
  assert.equal(r(s).pages[0]!.id, page);
  const copy = (await s.run('duplicate_page', { page })) as { page: string };
  assert.equal(findPage(r(s), copy.page)!.name, 'Trend lines (copy)');
  await s.run('remove_page', { page: copy.page });
  assert.equal(r(s).pages.length, n + 1);
  await assert.rejects(s.run('edit_page', { page: 'page99', name: 'X' }), (e: unknown) => e instanceof EditError && e.message === 'no page "page99"');

  const one = setup();
  for (const p of r(one).pages.slice(1)) await one.run('remove_page', { page: p.id });
  await assert.rejects(one.run('remove_page', { page: firstPage(one).id }), /keeps at least one page/);
});

test('visuals: add with fields, set a role, change the type, edit, duplicate, remove', async () => {
  const s = setup();
  const pageId = firstPage(s).id;
  const { visual } = (await s.run('add_visual', { page: pageId, type: 'bar', fields: { category: ['products.category'], values: ['sales.Revenue'] } })) as { visual: string };
  const v = () => findVisual(r(s), visual)!.visual;
  assert.deepEqual(v().fields, { category: ['products.category'], values: ['sales.Revenue'] });
  await assert.rejects(s.run('add_visual', { page: pageId, type: 'sparkle' }), /no visual type sparkle/);
  await assert.rejects(s.run('add_visual', { page: pageId, type: 'bar', fields: { y: ['sales.Revenue'] } }), /bar has no role y/);
  await assert.rejects(s.run('add_visual', { page: pageId, type: 'bar', fields: { values: ['sales.Nonsense'] } }), /no field sales\.Nonsense/);

  await s.run('set_visual_fields', { visual, role: 'values', fields: ['sales.Revenue', { field: 'sales.quantity', agg: 'avg', label: 'Avg units' }] });
  assert.deepEqual(v().fields.values, ['sales.Revenue', { field: 'sales.quantity', agg: 'avg', label: 'Avg units' }]);
  await s.run('change_visual_type', { visual, type: 'column' });
  assert.equal(v().type, 'column');

  await s.run('edit_visual', {
    visual,
    title: 'Revenue by category',
    options: { labels: true },
    limit: 10,
    filterOthers: false,
    background: '#f4f4f4',
    layout: { x: 0, y: 20, w: 6, h: 4 },
    phone: { hidden: true },
    conditional: [{ apply: 'sales.Revenue', op: 'gt', value: 1000, tone: 'good' }],
  });
  assert.deepEqual(
    (({ title, options, limit, interactions, style, layout, phone }) => ({ title, options, limit, interactions, style, layout, phone }))(v()),
    { title: 'Revenue by category', options: { labels: true }, limit: 10, interactions: { filterOthers: false }, style: { surface: '#f4f4f4' }, layout: { x: 0, y: 20, w: 6, h: 4 }, phone: { hidden: true } },
  );
  await s.run('edit_visual', { visual, options: { labels: null }, background: null, repeat: { field: 'stores.region' } });
  await s.run('set_visual_sql', { visual, sql: 'SELECT 1 AS c, 2 AS v' });
  assert.equal(v().sql, 'SELECT 1 AS c, 2 AS v');
  await s.run('set_visual_sql', { visual, sql: null });
  assert.equal(v().sql, undefined);
  await s.run('set_visual_sql', { visual, sql: 'SELECT 1 AS c, 2 AS v' });
  assert.deepEqual([v().options, v().style, v().sql, v().repeat], [{}, undefined, 'SELECT 1 AS c, 2 AS v', { field: 'stores.region' }]);
  await assert.rejects(s.run('edit_visual', { visual, options: { sparkle: true } }), /column has no option sparkle/);
  await assert.rejects(s.run('edit_visual', { visual, options: { labels: 'yes' } }), /takes true or false/);

  const copy = (await s.run('duplicate_visual', { visual })) as { visual: string };
  assert.ok(findVisual(r(s), copy.visual));
  await s.run('remove_visual', { visual: copy.visual });
  assert.equal(findVisual(r(s), copy.visual), undefined);
});

test('filters on the report, a page and a visual: add, edit, remove by place', async () => {
  const s = setup();
  const pageId = firstPage(s).id;
  const before = (r(s).filters ?? []).length;
  await s.run('add_filter', { scope: 'report', filter: { field: 'stores.region', op: 'in', values: ['North'] } });
  await s.run('add_filter', { scope: { page: pageId }, filter: { field: 'sales.Revenue', op: 'gt', values: [100] } });
  await s.run('add_filter', { scope: { visual: 'c-cat' }, filter: { field: 'products.category', op: 'not-in', values: ['Other'] } });
  assert.equal(r(s).filters!.length, before + 1);
  await s.run('edit_filter', { scope: 'report', index: before, filter: { field: 'stores.region', op: 'in', values: ['South'] } });
  assert.deepEqual(r(s).filters![before]!.values, ['South']);
  await s.run('remove_filter', { scope: { visual: 'c-cat' }, index: (findVisual(r(s), 'c-cat')!.visual.filters ?? []).length - 1 });
  await assert.rejects(s.run('remove_filter', { scope: { page: pageId }, index: 99 }), /no filter at 99/);
  await assert.rejects(s.run('add_filter', { scope: { page: 'page99' }, filter: { field: 'sales.Revenue', op: 'gt', values: [1] } }), /no page "page99"/);
});

test('the report, its theme and a table', async () => {
  const s = setup();
  await s.run('rename_report', { name: 'Sales review' });
  await s.run('set_theme', { theme: 'midnight' });
  await s.run('edit_table', { table: 'stores', label: 'Shops', hidden: true });
  assert.deepEqual([r(s).name, r(s).theme, r(s).model.tables!.stores!.label, r(s).model.tables!.stores!.hidden], ['Sales review', 'midnight', 'Shops', true]);
});

test('each action is one undo step, and one that fails leaves none', async () => {
  const s = setup();
  const before = JSON.stringify(r(s));
  await s.run('edit_visual', { visual: 'c-cat', title: 'A', subtitle: 'B', limit: 5, layout: { x: 1, y: 1, w: 4, h: 3 } });
  s.store.undo();
  assert.equal(JSON.stringify(r(s)), before, 'one undo takes the whole action back');
  assert.equal(s.store.canUndo, false);
  await assert.rejects(s.run('remove_visual', { visual: 'nope' }));
  assert.equal(s.store.canUndo, false, 'nothing to undo after a refused action');
});

test('through the agent: a report change waits for the user, and the schema refuses a malformed call', async () => {
  const s = setup();
  let step = 0;
  const steps: StreamEvent[][] = [
    [
      { type: 'tool_call', call: { id: 'c1', name: 'rename_report', arguments: { name: 'From the agent' } } },
      { type: 'tool_call', call: { id: 'c2', name: 'remove_visual', arguments: { id: 'c-cat' } } },
      { type: 'done', reason: 'tool_calls' },
    ],
    [{ type: 'done', reason: 'stop' }],
  ];
  const gateway: Gateway = { chat: async function* () { yield* steps[step++] ?? []; }, models: async () => [] };
  const asked: string[] = [];
  const result = await runAgent(
    { gateway, model: 'm', actions: s.actions as Action[], grants: async () => defaultGrants(), approve: async (q) => (asked.push(q.action), 'once'), log: memoryLog() },
    [{ role: 'user', content: 'Rename the report.' }],
  );
  assert.deepEqual(asked, ['rename_report'], 'the change asked first; the malformed call was never put to the user');
  assert.equal(r(s).name, 'From the agent');
  assert.match(result.messages.find((m) => m.toolCallId === 'c2')!.content, /"visual" is required/);
  assert.ok(findVisual(r(s), 'c-cat'));
});

// ---------------------------------------------------------------- the model (part A2)

const measure = (s: { store: DocStore }, table: string, name: string) => (r(s).model.measures ?? []).find((m) => m.table === table && m.name === name);
const column = (s: { store: DocStore }, table: string, name: string) => (r(s).model.columns ?? []).find((m) => m.table === table && m.name === name);

test('the actions that write SQL run code, and the ones that test it read rows', () => {
  const { actions } = setup();
  const code = actions.filter((a) => a.runsCode).map((a) => a.name);
  assert.deepEqual(code, ['set_visual_sql', 'add_measure', 'edit_measure', 'add_calculated_column', 'edit_calculated_column']);
  assert.deepEqual(actions.filter((a) => a.touches.rows).map((a) => a.name), ['add_measure', 'edit_measure', 'add_calculated_column', 'edit_calculated_column']);
});

test('measures: added after a test, usable by the next action at once, changed, removed', async () => {
  const s = setup();
  await s.run('add_measure', { table: 'sales', name: 'Big orders', sql: 'COUNT(*) FILTER (WHERE sales.quantity > 5)', format: 'integer', description: 'Orders of more than five' });
  assert.deepEqual(measure(s, 'sales', 'Big orders'), { table: 'sales', name: 'Big orders', sql: 'COUNT(*) FILTER (WHERE sales.quantity > 5)', format: 'integer', description: 'Orders of more than five' });
  const { visual } = (await s.run('add_visual', { page: firstPage(s).id, type: 'card', fields: { values: ['sales.Big orders'] } })) as { visual: string };
  assert.ok(findVisual(r(s), visual), 'the new measure is a field for the next action');

  await s.run('edit_measure', { table: 'sales', name: 'Big orders', newName: 'Large orders', format: null, description: '' });
  assert.deepEqual(measure(s, 'sales', 'Large orders'), { table: 'sales', name: 'Large orders', sql: 'COUNT(*) FILTER (WHERE sales.quantity > 5)' });
  assert.equal(measure(s, 'sales', 'Big orders'), undefined);
  await assert.rejects(s.run('edit_measure', { table: 'sales', name: 'Revenue YTD', sql: 'SUM(1)' }), /time-intelligence quick measure/);
  await s.run('remove_measure', { table: 'sales', name: 'Large orders' });
  assert.equal(measure(s, 'sales', 'Large orders'), undefined);
  await assert.rejects(s.run('remove_measure', { table: 'sales', name: 'Large orders' }), (e: unknown) => e instanceof EditError && e.message === 'no measure sales.Large orders');
});

test('measures: a colliding name or a failed test is refused, and changes nothing', async () => {
  const s = setup();
  const before = JSON.stringify(r(s));
  await assert.rejects(s.run('add_measure', { table: 'sales', name: 'revenue', sql: 'SUM(sales.quantity)' }), (e: unknown) => e instanceof EditError && e.message === 'a measure named revenue already exists');
  await assert.rejects(s.run('add_measure', { table: 'sales', name: 'Quantity', sql: 'SUM(sales.quantity)' }), /sales already has a field named Quantity/);
  await assert.rejects(s.run('edit_measure', { table: 'sales', name: 'Units', newName: 'Cost' }), /a measure named Cost already exists/);
  await assert.rejects(s.run('add_measure', { table: 'sales', name: 'Loop', sql: '[Loop] + 1' }), /^Error: the test failed: /);
  await assert.rejects(s.run('add_measure', { table: 'nowhere', name: 'X', sql: 'COUNT(*)' }), /no table nowhere/);
  assert.equal(JSON.stringify(r(s)), before);
  assert.equal(s.store.canUndo, false);
});

test("a failed test's engine message reaches the model only where sample rows are granted", async () => {
  const s = setup();
  await assert.rejects(s.run('add_measure', { table: 'sales', name: 'Bad', sql: 'SUM(sales.no_such_column)' }), /the test query failed; the engine's message is withheld/);
  const sample = setup({ level: 'sample' });
  await assert.rejects(sample.run('add_measure', { table: 'sales', name: 'Bad', sql: 'SUM(sales.no_such_column)' }), (e: unknown) => /^the test query failed: /.test((e as Error).message) && !/withheld/.test((e as Error).message));
});

test('measures and calculated columns: what the user excluded cannot be used, or learned through a name', async () => {
  const s = setup({ excludeTables: ['stores'], excludeColumns: ['sales.discount'] });
  await assert.rejects(s.run('add_measure', { table: 'sales', name: 'D', sql: 'SUM(sales.discount)' }), /names a table or column the user excluded/);
  await assert.rejects(s.run('add_measure', { table: 'sales', name: 'Regions', sql: 'COUNT(DISTINCT stores.region)' }), /names a table or column the user excluded/);
  await assert.rejects(s.run('add_measure', { table: 'sales', name: 'discount', sql: 'COUNT(*)' }), (e: unknown) => (e as Error).message === "the name discount can't be used");
  await assert.rejects(s.run('add_measure', { table: 'stores', name: 'Shops', sql: 'COUNT(*)' }), /no table stores/);
  const noProducts = setup({ excludeTables: ['products'] });
  await assert.rejects(noProducts.run('add_measure', { table: 'sales', name: 'Double cost', sql: '[Cost] * 2' }), /reaches a table or column the user excluded, through a measure or column it uses/);
});

test('calculated columns: added after a test with the type of their values, changed, removed', async () => {
  const s = setup();
  await s.run('add_calculated_column', { table: 'sales', name: 'Big', sql: 'sales.quantity > 5' });
  assert.equal(column(s, 'sales', 'Big')!.type, 'number');
  await s.run('add_calculated_column', { table: 'sales', name: 'Size', sql: "CASE WHEN sales.quantity > 5 THEN 'big' ELSE 'small' END" });
  assert.equal(column(s, 'sales', 'Size')!.type, 'text');
  await s.run('add_visual', { page: firstPage(s).id, type: 'bar', fields: { category: ['sales.Size'], values: ['sales.Revenue'] } });
  await s.run('edit_calculated_column', { table: 'sales', name: 'Size', newName: 'Order size' });
  assert.ok(column(s, 'sales', 'Order size') && !column(s, 'sales', 'Size'));
  await assert.rejects(s.run('add_calculated_column', { table: 'sales', name: 'year', sql: '1' }), /sales already has a field named year/);
  await s.run('remove_calculated_column', { table: 'sales', name: 'Big' });
  assert.equal(column(s, 'sales', 'Big'), undefined);
});

test('relationships: add, change, remove by place; one table, a calculated column or a pair already related is refused', async () => {
  const s = setup();
  const n = r(s).model.relationships!.length;
  const { index } = (await s.run('add_relationship', { from: 'budget.year', to: 'calendar.year', active: false, role: 'Budget year' })) as { index: number };
  assert.equal(index, n);
  assert.deepEqual(r(s).model.relationships![index], { from: 'budget.year', to: 'calendar.year', active: false, role: 'Budget year' });
  await s.run('edit_relationship', { index, active: true, role: '' });
  assert.deepEqual(r(s).model.relationships![index], { from: 'budget.year', to: 'calendar.year', active: undefined, role: undefined });
  await assert.rejects(s.run('add_relationship', { from: 'customers.id', to: 'sales.customer_id' }), /sales\.customer_id and customers\.id are already related|customers\.id and sales\.customer_id are already related/);
  await assert.rejects(s.run('add_relationship', { from: 'sales.store_id', to: 'sales.product_id' }), /columns of one table/);
  await assert.rejects(s.run('add_relationship', { from: 'sales.Year', to: 'year.year' }), /no column sales\.Year of the data/);
  await assert.rejects(s.run('edit_relationship', { index: 0, from: 'sales.product_id', to: 'products.id' }), /sales\.product_id and products\.id are already related/);
  await s.run('remove_relationship', { index });
  assert.equal(r(s).model.relationships!.length, n);
  await assert.rejects(s.run('remove_relationship', { index: 99 }), (e: unknown) => e instanceof EditError && e.message === 'no relationship at 99');

  const hidden = setup({ excludeTables: ['stores'] });
  const at = r(hidden).model.relationships!.findIndex((x) => x.to === 'stores.id');
  await assert.rejects(hidden.run('remove_relationship', { index: at }), /joins a table or column the user excluded/);
  await assert.rejects(hidden.run('add_relationship', { from: 'customers.city', to: 'stores.city' }), /no column/);
});

test('hierarchies: add with two levels or more, each a column of the table; remove', async () => {
  const s = setup();
  await s.run('add_hierarchy', { table: 'products', name: 'Range', levels: ['category', 'name'] });
  assert.deepEqual(r(s).model.hierarchies!.at(-1), { table: 'products', name: 'Range', levels: ['category', 'name'] });
  await assert.rejects(s.run('add_hierarchy', { table: 'products', name: 'Bad', levels: ['category', 'colour'] }), /Not columns of products: colour/);
  await assert.rejects(s.run('add_hierarchy', { table: 'sales', name: 'date', levels: ['Year', 'Month'] }), /sales already has a field named date/);
  await s.run('remove_hierarchy', { table: 'products', name: 'Range' });
  await assert.rejects(s.run('remove_hierarchy', { table: 'products', name: 'Range' }), /no hierarchy "Range" on products/);
});

test('parameters: the whole list, checked as the designer checks it', async () => {
  const s = setup();
  const growth = r(s).model.parameters![0]!;
  await s.run('set_parameters', { parameters: [growth, { name: 'Region', type: 'text', value: 'North', choices: ['North', 'South'] }] });
  assert.deepEqual(r(s).model.parameters!.map((p) => p.name), ['Growth', 'Region']);
  await assert.rejects(s.run('set_parameters', { parameters: [growth, { ...growth, name: 'growth' }] }), /Two parameters are named growth/);
  await assert.rejects(s.run('set_parameters', { parameters: [{ name: 'N', type: 'number', value: 'five' }] }), /a number parameter's value is a number/);
  await assert.rejects(s.run('set_parameters', { parameters: [{ name: 'N', type: 'number', value: 1, min: 5, max: 2 }] }), /the minimum is above the maximum/);
  await s.run('set_parameters', { parameters: [] });
  assert.equal(r(s).model.parameters, undefined);
});
