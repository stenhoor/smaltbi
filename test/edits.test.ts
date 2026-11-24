// Changes to a report (core/edits.ts): the designer's edits, which the agent's actions will share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as edit from '../src/core/edits.js';
import { visualDef } from '../src/visuals/index.js';
import type { Report, Visual } from '../src/core/types.js';

const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

function report(): Report {
  return {
    smaltbi: 1,
    name: 'Sales',
    data: { steps: [] },
    model: {
      relationships: [{ from: 'orders.customer_id', to: 'customers.id' }],
      measures: [{ table: 'orders', name: 'Revenue', sql: 'SUM(orders.amount)' }],
      columns: [],
      hierarchies: [],
    },
    pages: [
      { id: 'page1', name: 'Overview', visuals: [{ id: 'v1', type: 'card', layout: L(0, 0, 3, 2), fields: { values: ['orders.Revenue'] } }] },
      { id: 'page2', name: 'Detail', visuals: [{ id: 'v2', type: 'table', layout: L(0, 0, 5, 5), fields: { columns: ['customers.name', 'orders.amount'] } }] },
    ],
  };
}

const visual = (r: Report, id: string): Visual => edit.findVisual(r, id)!.visual;

test('new ids and free spots', () => {
  assert.equal(edit.newId('v', ['v1', 'v3']), 'v2');
  const page = report().pages[0]!;
  assert.deepEqual(edit.freeSpot(page, 3, 2), { x: 3, y: 0 });
  assert.deepEqual(edit.freeSpot(page, 12, 1), { x: 0, y: 2 });
});

test('the report: name, theme, branding and plugins', () => {
  const r = report();
  edit.renameReport(r, '');
  assert.equal(r.name, 'Untitled report');
  edit.setTheme(r, 'kiln');
  assert.equal(r.theme, 'kiln');
  edit.setPoweredBy(r, false);
  assert.deepEqual(r.branding, { poweredBy: false });
  edit.setPoweredBy(r, true);
  assert.equal('branding' in r, false, 'shown is the default: nothing is written');
  edit.addPlugin(r, { url: 'a.js', integrity: 'sha384-a' });
  edit.addPlugin(r, { url: 'b.js', integrity: 'sha384-b' });
  edit.removePlugin(r, 0);
  assert.deepEqual(r.plugins?.map((p) => p.url), ['b.js']);
  edit.removePlugin(r, 0);
  assert.equal('plugins' in r, false);
});

test('filters on the report, a page or a visual', () => {
  const r = report();
  const f = { field: 'customers.region', op: 'in' as const, values: ['North'] };
  edit.addFilter(r, 'report', f);
  edit.addFilter(r, { page: 'page2' }, f);
  edit.addFilter(r, { visual: 'v2' }, f);
  edit.addFilter(r, { visual: 'v2' }, { ...f, values: ['South'] });
  assert.equal(r.filters?.length, 1);
  assert.equal(r.pages[1]!.filters?.length, 1);
  assert.deepEqual(visual(r, 'v2').filters?.map((x) => x.values), [['North'], ['South']]);
  edit.setFilters(r, { visual: 'v2' }, []);
  assert.deepEqual(visual(r, 'v2').filters, []);
  edit.addFilter(r, { page: 'nope' }, f);
  assert.equal(JSON.stringify(r).includes('nope'), false, 'a scope that is not in the report changes nothing');
});

test('pages: add, rename, hide, duplicate, move, remove', () => {
  const r = report();
  assert.equal(edit.addPage(r), 'page3');
  assert.equal(r.pages[2]!.name, 'Page 3');
  edit.renamePage(r, 'page3', '');
  assert.equal(r.pages[2]!.name, 'Page 3', 'an empty name keeps the name');
  edit.renamePage(r, 'page3', 'Trends');
  assert.equal(r.pages[2]!.name, 'Trends');
  edit.setPageHidden(r, 'page3', true);
  assert.equal(r.pages[2]!.hidden, true);
  edit.setPageHidden(r, 'page3', false);
  assert.equal(r.pages[2]!.hidden, undefined);

  const copy = edit.duplicatePage(r, 'page1');
  assert.equal(copy, 'page4');
  assert.deepEqual(r.pages.map((p) => p.id), ['page1', 'page4', 'page2', 'page3'], 'the copy goes after the page');
  assert.equal(r.pages[1]!.name, 'Overview (copy)');
  assert.deepEqual(r.pages[1]!.visuals.map((v) => v.id), ['v3'], 'its visuals get ids no visual has');
  assert.equal(edit.duplicatePage(r, 'nope'), undefined);

  edit.movePage(r, 'page3', -10);
  assert.deepEqual(r.pages.map((p) => p.id), ['page3', 'page1', 'page4', 'page2'], 'stops at the first place');
  edit.movePage(r, 'page3', 1);
  assert.deepEqual(r.pages.map((p) => p.id), ['page1', 'page3', 'page4', 'page2']);
  edit.movePage(r, 'nope', 1);
  assert.deepEqual(r.pages.map((p) => p.id), ['page1', 'page3', 'page4', 'page2'], 'a page that is not there moves nothing');
  edit.removePage(r, 'page4');
  assert.deepEqual(r.pages.map((p) => p.id), ['page1', 'page3', 'page2']);
});

test('a page: drill-through fields, size, rows and phone order', () => {
  const r = report();
  edit.addDrillthrough(r, 'page2', 'customers.name');
  edit.addDrillthrough(r, 'page2', 'customers.name');
  edit.addDrillthrough(r, 'page2', 'customers.region');
  assert.deepEqual(r.pages[1]!.drillthrough, ['customers.name', 'customers.region'], 'a field is not added twice');
  edit.removeDrillthrough(r, 'page2', 0);
  assert.deepEqual(r.pages[1]!.drillthrough, ['customers.region']);
  edit.setPageSize(r, 'page2', { preset: 'a4', landscape: true });
  edit.setPageRows(r, 'page2', 30);
  assert.deepEqual(r.pages[1]!.size, { preset: 'a4', landscape: true });
  assert.deepEqual(r.pages[1]!.layout, { rows: 30 });
  edit.setPageSize(r, 'page2', undefined);
  assert.equal('size' in r.pages[1]!, false);
  edit.setPhoneOrder(r, 'page2', ['v2']);
  assert.deepEqual(r.pages[1]!.phoneOrder, ['v2']);
  edit.setPhoneOrder(r, 'page2', undefined);
  assert.equal('phoneOrder' in r.pages[1]!, false);
});

test('visuals on a page: create, add, duplicate, lay out, remove', () => {
  const r = report();
  const id = edit.createVisual(r, 'page1', 'bar', { category: ['customers.region'] }, { columns: 12 });
  assert.equal(id, 'v3', 'an id no visual of any page has');
  assert.deepEqual(visual(r, 'v3').layout, L(3, 0, 5, 5), 'the first free spot of its size');
  edit.createVisual(r, 'page1', 'card', {}, { at: { x: 11, y: 8 }, columns: 12 });
  assert.deepEqual(visual(r, 'v4').layout, L(9, 8, 3, 2), 'kept on a 12-column page');
  assert.equal(edit.createVisual(r, 'nope', 'card', {}, { columns: 12 }), undefined);

  edit.addVisuals(r, 'page2', [{ id: 'v9', type: 'text', layout: L(0, 5, 6, 1), fields: {} }]);
  assert.deepEqual(r.pages[1]!.visuals.map((v) => v.id), ['v2', 'v9']);

  assert.equal(edit.duplicateVisual(r, 'page1', 'v1'), 'v5');
  assert.deepEqual(visual(r, 'v5').layout, L(8, 0, 3, 2), 'its size, on the first free spot');
  assert.equal(edit.duplicateVisual(r, 'page1', 'v2'), undefined, 'only a visual of that page');

  edit.setLayouts(r, 'page1', [['v1', L(0, 6, 3, 2)], ['v3', L(3, 6, 5, 5)], ['v2', L(0, 0, 1, 1)]]);
  assert.deepEqual(visual(r, 'v1').layout, L(0, 6, 3, 2));
  assert.deepEqual(visual(r, 'v2').layout, L(0, 0, 5, 5), 'a visual of another page is not moved');

  edit.removeVisuals(r, 'page1', new Set(['v1', 'v3']));
  assert.deepEqual(r.pages[0]!.visuals.map((v) => v.id), ['v4', 'v5']);
});

test('one visual: text, options, limit, interactions, style, phone, SQL, repeat, rules', () => {
  const r = report();
  edit.setVisualText(r, 'v2', 'title', 'Customers');
  edit.setVisualText(r, 'v2', 'subtitle', '');
  assert.equal(visual(r, 'v2').title, 'Customers');
  assert.equal(visual(r, 'v2').subtitle, undefined);

  // The Format tab keeps an emptied number as undefined; clearing takes the key off, so the default applies.
  edit.setVisualOption(r, 'v2', 'rowHeight', undefined);
  assert.equal('rowHeight' in visual(r, 'v2').options!, true);
  edit.setVisualOption(r, 'v2', 'widths', { name: 120 });
  edit.clearVisualOption(r, 'v2', 'rowHeight');
  assert.deepEqual(visual(r, 'v2').options, { widths: { name: 120 } });

  edit.setVisualLimit(r, 'v2', 50);
  assert.equal(visual(r, 'v2').limit, 50);
  edit.setVisualLimit(r, 'v2', 0);
  assert.equal(visual(r, 'v2').limit, undefined);

  edit.setInteraction(r, 'v2', 'filterOthers', false);
  assert.deepEqual(visual(r, 'v2').interactions, { filterOthers: false });

  edit.setVisualStyle(r, 'v2', 'surface', '#eeeeee');
  assert.deepEqual(visual(r, 'v2').style, { surface: '#eeeeee' });
  edit.resetVisualStyle(r, 'v2');
  assert.equal('style' in visual(r, 'v2'), false);

  edit.setVisualPhone(r, 'v2', { hidden: true });
  edit.setVisualPhone(r, 'v2', { h: 4 });
  assert.deepEqual(visual(r, 'v2').phone, { hidden: true, h: 4 });
  edit.setVisualPhone(r, 'v2', { hidden: false, h: undefined });
  assert.equal('phone' in visual(r, 'v2'), false, 'nothing set: taken off');

  edit.setVisualLayout(r, 'v2', L(1, 1, 4, 4));
  assert.deepEqual(visual(r, 'v2').layout, L(1, 1, 4, 4));

  edit.setCustomSql(r, 'v2', 'SELECT 1');
  assert.equal(visual(r, 'v2').sql, 'SELECT 1');
  edit.setCustomSql(r, 'v2', undefined);
  assert.equal('sql' in visual(r, 'v2'), false);

  edit.setRepeat(r, 'v2', { field: 'customers.region' });
  assert.deepEqual(visual(r, 'v2').repeat, { field: 'customers.region' });
  edit.setRepeat(r, 'v2', undefined);
  assert.equal('repeat' in visual(r, 'v2'), false);

  edit.setConditional(r, 'v1', [{ apply: 'orders.Revenue', op: 'lt', value: 0, tone: 'bad' }]);
  assert.equal(visual(r, 'v1').conditional?.length, 1);
  edit.setConditional(r, 'v1', []);
  assert.equal(visual(r, 'v1').conditional, undefined);
});

test("a visual's fields: add, replace, move, remove, aggregation and label", () => {
  const r = report();
  edit.addField(r, 'v2', 'columns', 'orders.date');
  assert.deepEqual(visual(r, 'v2').fields.columns, ['customers.name', 'orders.amount', 'orders.date']);
  edit.moveField(r, 'v2', 'columns', 2, 0);
  assert.deepEqual(visual(r, 'v2').fields.columns, ['orders.date', 'customers.name', 'orders.amount']);
  edit.setField(r, 'v2', 'columns', 2, edit.withAgg('orders.amount', 'avg'));
  edit.setField(r, 'v2', 'columns', 2, edit.withLabel(visual(r, 'v2').fields.columns![2]!, 'Average'));
  assert.deepEqual(visual(r, 'v2').fields.columns![2], { field: 'orders.amount', agg: 'avg', label: 'Average' });
  edit.setField(r, 'v2', 'columns', 2, edit.withLabel(visual(r, 'v2').fields.columns![2]!, ''));
  assert.deepEqual(visual(r, 'v2').fields.columns![2], { field: 'orders.amount', agg: 'avg' }, 'an empty label takes the label off');
  assert.equal(edit.withLabel({ field: 'orders.amount', label: 'Amount' }, ''), 'orders.amount', 'nothing left: a plain field');
  edit.removeField(r, 'v2', 'columns', 0);
  assert.deepEqual(visual(r, 'v2').fields.columns, ['customers.name', { field: 'orders.amount', agg: 'avg' }]);
});

test('dropped fields: into a place, moved within the visual, and up to a maximum', () => {
  const r = report();
  const columns = { name: 'columns', kind: 'dimension' as const };
  edit.dropFields(r, 'v2', columns, 1, ['orders.date']);
  assert.deepEqual(visual(r, 'v2').fields.columns, ['customers.name', 'orders.date', 'orders.amount']);

  // A chip moved down its own well: it leaves its place first, so the place counts without it.
  edit.dropFields(r, 'v2', columns, 3, ['customers.name'], { visual: 'v2', role: 'columns', i: 0, spec: 'customers.name' });
  assert.deepEqual(visual(r, 'v2').fields.columns, ['orders.date', 'orders.amount', 'customers.name']);

  // Moved into a dimension well from a measure well: its aggregation stays behind, its label goes with it.
  visual(r, 'v2').fields.values = [{ field: 'orders.amount', agg: 'sum', label: 'Amount' }];
  edit.dropFields(r, 'v2', columns, 0, ['orders.amount'], { visual: 'v2', role: 'values', i: 0, spec: { field: 'orders.amount', agg: 'sum', label: 'Amount' } });
  assert.deepEqual(visual(r, 'v2').fields.values, []);
  assert.deepEqual(visual(r, 'v2').fields.columns![0], { field: 'orders.amount', label: 'Amount' });

  // A role with a maximum keeps what was dropped.
  const axis = { name: 'category', kind: 'dimension' as const, max: 1 };
  edit.dropFields(r, 'v1', axis, 0, ['customers.region']);
  edit.dropFields(r, 'v1', axis, 1, ['customers.name']);
  assert.deepEqual(visual(r, 'v1').fields.category, ['customers.name']);
});

test("a visual's type: its fields move to the new type's roles and its options go", () => {
  const r = report();
  visual(r, 'v2').options = { widths: { name: 120 } };
  const from = visualDef('table')!.roles;
  const to = visualDef('bar')!.roles;
  edit.changeVisualType(r, 'v2', 'bar', { from, to });
  const v = visual(r, 'v2');
  assert.equal(v.type, 'bar');
  assert.equal(v.options, undefined);
  const dims = to.filter((x) => x.kind === 'dimension').flatMap((x) => v.fields[x.name] ?? []);
  assert.equal(dims[0], 'customers.name', 'the first dimension goes to the first dimension role');
  assert.deepEqual(Object.values(v.fields).flat().sort(), [...new Set(Object.values(v.fields).flat())].sort(), 'no field twice');
});

test('the model: tables, hierarchies, relationships and the diagram', () => {
  const r = report();
  edit.setTableSettings(r, 'orders', { label: 'Orders' });
  edit.setTableSettings(r, 'orders', { hidden: true });
  assert.deepEqual(r.model.tables, { orders: { label: 'Orders', hidden: true } });

  edit.addHierarchy(r, { table: 'orders', name: 'Calendar', levels: ['year', 'month'] });
  edit.removeHierarchy(r, 'orders', 'Calendar');
  assert.deepEqual(r.model.hierarchies, []);

  edit.addRelationships(r, [{ from: 'orders.product_id', to: 'products.id' }]);
  edit.updateRelationship(r, 1, { active: false });
  assert.deepEqual(r.model.relationships![1], { from: 'orders.product_id', to: 'products.id', active: false });
  edit.removeRelationship(r, 0);
  assert.deepEqual(r.model.relationships!.map((x) => x.from), ['orders.product_id']);

  edit.setTablePosition(r, 'orders', { x: 40, y: 80 });
  assert.deepEqual(r.model.layout, { orders: { x: 40, y: 80 } });
  edit.resetDiagram(r);
  assert.equal('layout' in r.model, false);

  edit.setParameters(r, [{ name: 'Rate', type: 'number', value: 1 }]);
  assert.equal(r.model.parameters?.length, 1);
  edit.setParameters(r, []);
  assert.equal('parameters' in r.model, false);
});

test('measures and calculated columns: added, replaced, removed', () => {
  const r = report();
  edit.putEntry(r, 'measures', { table: 'orders', name: 'Orders', sql: 'COUNT(*)' });
  edit.putEntry(r, 'measures', { table: 'orders', name: 'Revenue', sql: 'SUM(orders.net)' }, { table: 'orders', name: 'Revenue' });
  assert.deepEqual(r.model.measures!.map((m) => [m.name, m.sql]), [['Revenue', 'SUM(orders.net)'], ['Orders', 'COUNT(*)']]);
  edit.putEntry(r, 'columns', { table: 'orders', name: 'Year', sql: "strftime('%Y', orders.date)", type: 'text' });
  assert.equal(r.model.columns!.length, 1);

  // Two measures with one table and name: the measure dialog removes the first, the quick-measure dialog every one.
  edit.putEntry(r, 'measures', { table: 'orders', name: 'Orders', sql: 'COUNT(orders.id)' });
  edit.removeEntry(r, 'measures', 'orders', 'Orders');
  assert.deepEqual(r.model.measures!.map((m) => m.sql), ['SUM(orders.net)', 'COUNT(orders.id)']);
  edit.putEntry(r, 'measures', { table: 'orders', name: 'Orders', sql: 'COUNT(*)' });
  edit.removeEntry(r, 'measures', 'orders', 'Orders', 'all');
  assert.deepEqual(r.model.measures!.map((m) => m.name), ['Revenue']);
});
