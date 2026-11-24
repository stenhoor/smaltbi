// Changes to a report (core/edits.ts): the designer's edits, which the agent's actions will share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as edit from '../src/core/edits.js';
import { visualDef } from '../src/visuals/index.js';
import { DocStore } from '../src/designer/store.js';
import { sampleSession } from './helpers.js';
import type { Report, Visual } from '../src/core/types.js';
import type { SchemaInfo } from '../src/core/model.js';

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

/** The data's tables, as introspection gives them. */
const schema: SchemaInfo = {
  tables: [
    { name: 'orders', kind: 'table', columns: [{ name: 'id', type: 'number', pk: true }, { name: 'amount', type: 'number' }, { name: 'date', type: 'date' }] },
    { name: 'customers', kind: 'table', columns: [{ name: 'id', type: 'number', pk: true }, { name: 'name', type: 'text' }] },
  ],
};

/** Throws an EditError with this message, and leaves the report as it was. */
function refused(r: Report, fn: () => unknown, message: string): void {
  const before = JSON.stringify(r);
  assert.throws(fn, (e: unknown) => e instanceof edit.EditError && e.message === message);
  assert.equal(JSON.stringify(r), before, `nothing changed: ${message}`);
}

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
  refused(r, () => edit.addFilter(r, { page: 'nope' }, f), 'no page "nope"');
  refused(r, () => edit.setFilters(r, { visual: 'nope' }, []), 'no visual "nope"');
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
  refused(r, () => edit.duplicatePage(r, 'nope'), 'no page "nope"');

  edit.movePage(r, 'page3', -10);
  assert.deepEqual(r.pages.map((p) => p.id), ['page3', 'page1', 'page4', 'page2'], 'stops at the first place');
  edit.movePage(r, 'page3', 1);
  assert.deepEqual(r.pages.map((p) => p.id), ['page1', 'page3', 'page4', 'page2']);
  refused(r, () => edit.movePage(r, 'nope', 1), 'no page "nope"');
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
  refused(r, () => edit.createVisual(r, 'nope', 'card', {}, { columns: 12 }), 'no page "nope"');

  edit.addVisuals(r, 'page2', [{ id: 'v9', type: 'text', layout: L(0, 5, 6, 1), fields: {} }]);
  assert.deepEqual(r.pages[1]!.visuals.map((v) => v.id), ['v2', 'v9']);

  assert.equal(edit.duplicateVisual(r, 'page1', 'v1'), 'v5');
  assert.deepEqual(visual(r, 'v5').layout, L(8, 0, 3, 2), 'its size, on the first free spot');
  refused(r, () => edit.duplicateVisual(r, 'page1', 'v2'), 'no visual "v2" on page "page1"');

  refused(r, () => edit.setLayouts(r, 'page1', [['v1', L(0, 6, 3, 2)], ['v2', L(0, 0, 1, 1)]]), 'no visual "v2" on page "page1"');
  edit.setLayouts(r, 'page1', [['v1', L(0, 6, 3, 2)], ['v3', L(3, 6, 5, 5)]]);
  assert.deepEqual(visual(r, 'v1').layout, L(0, 6, 3, 2));
  refused(r, () => edit.removeVisuals(r, 'page1', ['v1', 'v2']), 'no visual "v2" on page "page1"');

  edit.removeVisuals(r, 'page1', new Set(['v1', 'v3']));
  assert.deepEqual(r.pages[0]!.visuals.map((v) => v.id), ['v4', 'v5']);
});

test('one visual: text, options, limit, interactions, style, phone, SQL, repeat, rules', () => {
  const r = report();
  edit.setVisualText(r, 'v2', 'title', 'Customers');
  edit.setVisualText(r, 'v2', 'subtitle', '');
  assert.equal(visual(r, 'v2').title, 'Customers');
  assert.equal(visual(r, 'v2').subtitle, undefined);

  // An option set to undefined (a number emptied in the Format tab) is taken off, so its default applies.
  edit.setVisualOption(r, 'v2', 'rowHeight', 28);
  edit.setVisualOption(r, 'v2', 'widths', { name: 120 });
  assert.deepEqual(visual(r, 'v2').options, { rowHeight: 28, widths: { name: 120 } });
  edit.setVisualOption(r, 'v2', 'rowHeight', undefined);
  assert.deepEqual(visual(r, 'v2').options, { widths: { name: 120 } });
  assert.equal('rowHeight' in visual(r, 'v2').options!, false);

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

  edit.addHierarchy(r, { table: 'orders', name: 'Calendar', levels: ['date', 'amount'] }, schema);
  refused(r, () => edit.addHierarchy(r, { table: 'orders', name: 'calendar', levels: ['date', 'amount'] }, schema), 'orders already has a field named calendar');
  refused(r, () => edit.addHierarchy(r, { table: 'orders', name: 'AMOUNT', levels: ['date', 'amount'] }, schema), 'orders already has a field named AMOUNT');
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
  edit.putEntry(r, 'measures', { table: 'orders', name: 'Orders', sql: 'COUNT(*)' }, undefined, schema);
  edit.putEntry(r, 'measures', { table: 'orders', name: 'Revenue', sql: 'SUM(orders.net)' }, { table: 'orders', name: 'Revenue' }, schema);
  assert.deepEqual(r.model.measures!.map((m) => [m.name, m.sql]), [['Revenue', 'SUM(orders.net)'], ['Orders', 'COUNT(*)']]);
  edit.putEntry(r, 'columns', { table: 'orders', name: 'Year', sql: "strftime('%Y', orders.date)", type: 'text' }, undefined, schema);
  assert.equal(r.model.columns!.length, 1);

  // No colliding names, whatever their case (the owner, 2026-11-24). A measure: no other measure's name, in any table,
  // and no field of its table (a data column, a calculated column, a hierarchy).
  const collides = (kind: 'measure' | 'column' | 'hierarchy', table: string, name: string, except?: { table: string; name: string }) => edit.nameCollision(r, schema, kind, table, name, except);
  assert.equal(collides('measure', 'customers', 'orders'), 'a measure named orders already exists');
  assert.equal(collides('measure', 'orders', 'Orders', { table: 'orders', name: 'Orders' }), null, 'the measure being edited keeps its name');
  assert.equal(collides('measure', 'orders', 'amount'), 'orders already has a field named amount');
  assert.equal(collides('measure', 'customers', 'amount'), null, "another table's columns don't count for a measure");
  refused(r, () => edit.putEntry(r, 'measures', { table: 'customers', name: 'REVENUE', sql: 'COUNT(*)' }, undefined, schema), 'a measure named REVENUE already exists');
  refused(r, () => edit.putEntry(r, 'measures', { table: 'orders', name: 'Revenue', sql: '1' }, { table: 'orders', name: 'Orders' }, schema), 'a measure named Revenue already exists');
  refused(r, () => edit.putEntry(r, 'measures', { table: 'orders', name: 'Year', sql: 'COUNT(*)' }, undefined, schema), 'orders already has a field named Year');
  edit.putEntry(r, 'measures', { table: 'orders', name: 'Order count', sql: 'COUNT(*)' }, { table: 'orders', name: 'Orders' }, schema);
  assert.deepEqual(r.model.measures!.map((m) => m.name), ['Revenue', 'Order count']);

  // A calculated column: no field of its table. Another table's names don't count; the one being edited keeps its own.
  r.model.hierarchies = [{ table: 'orders', name: 'Calendar', levels: ['Year', 'date'] }];
  const column = (name: string) => ({ table: 'orders', name, sql: 'orders.amount * 2', type: 'number' as const });
  refused(r, () => edit.putEntry(r, 'columns', column('AMOUNT'), undefined, schema), 'orders already has a field named AMOUNT');
  refused(r, () => edit.putEntry(r, 'columns', column('year'), undefined, schema), 'orders already has a field named year');
  refused(r, () => edit.putEntry(r, 'columns', column('revenue'), undefined, schema), 'orders already has a field named revenue');
  refused(r, () => edit.putEntry(r, 'columns', column('calendar'), undefined, schema), 'orders already has a field named calendar');
  assert.equal(collides('column', 'customers', 'amount'), null);
  assert.equal(collides('column', 'orders', 'Year', { table: 'orders', name: 'Year' }), null);
  edit.putEntry(r, 'columns', { table: 'orders', name: 'Year', sql: "substr(orders.date, 1, 4)", type: 'text' }, { table: 'orders', name: 'Year' }, schema);
  edit.putEntry(r, 'columns', column('Double amount'), undefined, schema);
  assert.deepEqual(r.model.columns!.map((c) => [c.name, c.sql]), [['Year', 'substr(orders.date, 1, 4)'], ['Double amount', 'orders.amount * 2']]);

  // Reports from before this rule can have two measures with one table and name: the measure dialog removes the first,
  // the quick-measure dialog every one.
  r.model.measures!.push({ table: 'orders', name: 'Order count', sql: 'COUNT(orders.id)' });
  edit.removeEntry(r, 'measures', 'orders', 'Order count');
  assert.deepEqual(r.model.measures!.map((m) => m.sql), ['SUM(orders.net)', 'COUNT(orders.id)']);
  r.model.measures!.push({ table: 'orders', name: 'Order count', sql: 'COUNT(*)' });
  edit.removeEntry(r, 'measures', 'orders', 'Order count', 'all');
  assert.deepEqual(r.model.measures!.map((m) => m.name), ['Revenue']);
});

test('a target that is not in the report: an EditError, and nothing changes', () => {
  const r = report();
  refused(r, () => edit.renamePage(r, 'page9', 'X'), 'no page "page9"');
  refused(r, () => edit.removePage(r, 'page9'), 'no page "page9"');
  const one = report();
  edit.removePage(one, 'page2');
  refused(one, () => edit.removePage(one, 'page1'), 'a report keeps at least one page');
  refused(r, () => edit.setVisualText(r, 'v9', 'title', 'X'), 'no visual "v9"');
  refused(r, () => edit.changeVisualType(r, 'v9', 'bar', { from: [], to: [] }), 'no visual "v9"');
  refused(r, () => edit.removeDrillthrough(r, 'page1', 0), 'no drill-through field at 0 on page "page1"');
  refused(r, () => edit.removeField(r, 'v2', 'columns', 2), 'no field at 2 in columns of visual "v2"');
  refused(r, () => edit.moveField(r, 'v2', 'columns', 5, 0), 'no field at 5 in columns of visual "v2"');
  refused(r, () => edit.setField(r, 'v2', 'values', 0, 'orders.amount'), 'no field at 0 in values of visual "v2"');
  refused(r, () => edit.removePlugin(r, 0), 'no plugin at 0');
  refused(r, () => edit.updateRelationship(r, 1, { active: false }), 'no relationship at 1');
  refused(r, () => edit.removeRelationship(r, -1), 'no relationship at -1');
  refused(r, () => edit.removeHierarchy(r, 'orders', 'Calendar'), 'no hierarchy "Calendar" on orders');
  refused(r, () => edit.removeEntry(r, 'measures', 'orders', 'Profit'), 'no measure orders.Profit');
  refused(r, () => edit.removeEntry(r, 'columns', 'orders', 'Year', 'all'), 'no calculated column orders.Year');
  refused(r, () => edit.putEntry(r, 'measures', { table: 'orders', name: 'Profit', sql: '1' }, { table: 'orders', name: 'Profit' }, schema), 'no measure orders.Profit');
  assert.equal(edit.hasEntry(r, 'measures', 'orders', 'Revenue'), true);
  assert.equal(edit.hasEntry(r, 'measures', 'orders', 'Profit'), false);
});

test('the sample report has no colliding names', async () => {
  const { report: sample, schema: sampleSchema } = await sampleSession();
  const m = sample.model;
  const found = [
    ...(m.measures ?? []).map((x) => edit.nameCollision(sample, sampleSchema, 'measure', x.table, x.name, x)),
    ...(m.columns ?? []).map((x) => edit.nameCollision(sample, sampleSchema, 'column', x.table, x.name, x)),
    ...(m.hierarchies ?? []).map((x) => edit.nameCollision(sample, sampleSchema, 'hierarchy', x.table, x.name, x)),
  ].filter((x) => x !== null);
  assert.deepEqual(found, []);
});

test('DocStore.change: a change that throws leaves no undo step, and the redo history stays', () => {
  const store = new DocStore(report(), '');
  store.change('report', (r) => edit.renameReport(r, 'First'));
  store.undo();
  assert.equal(store.canRedo, true);
  assert.throws(() => store.change('pages', (r) => edit.renamePage(r, 'page9', 'X')), edit.EditError);
  assert.equal(store.canUndo, false, 'no undo step for the refused change');
  assert.equal(store.canRedo, true, 'redo still there');
  assert.equal(store.change('pages', (r) => edit.addPage(r)), 'page3', 'change returns what its function returns');
  assert.equal(store.canUndo, true);
});

test('a hierarchy needs a name and two levels or more, each a column of its table; addHierarchy refuses one that does not', async () => {
  const { report, schema } = await sampleSession();
  const problem = (levels: string[], name = 'H') => edit.hierarchyProblem(report, schema, { table: 'sales', name, levels });
  assert.equal(problem(['quantity', 'Year']), null, 'a data column and a calculated column');
  assert.equal(problem(['quantity']), 'A hierarchy needs a name and at least two levels');
  assert.equal(problem(['quantity', 'Year'], ' '), 'A hierarchy needs a name and at least two levels');
  assert.equal(problem(['quantity', 'colour', 'size']), 'Not columns of sales: colour, size');
  assert.throws(() => edit.addHierarchy(report, { table: 'sales', name: 'H', levels: ['colour', 'size'] }, schema), (e: unknown) => e instanceof edit.EditError && e.message === 'Not columns of sales: colour, size');
});

test('what-if parameters: usable names, one of each name, values of their type, ranges on numbers and choices on text', () => {
  const ok = { name: 'Growth', type: 'number', value: 0.1, min: 0, max: 1 } as const;
  assert.equal(edit.parameterProblem([ok, { name: 'Region', type: 'text', value: 'North', choices: ['North'] }]), null);
  assert.equal(edit.parameterProblem([{ ...ok, name: '1st' }]), '"1st" is not a usable name: letters, digits, spaces and _ (starting with a letter)');
  assert.equal(edit.parameterProblem([ok, { ...ok, name: 'GROWTH' }]), 'Two parameters are named GROWTH');
  assert.equal(edit.parameterProblem([{ ...ok, value: 'x' }]), "Growth: a number parameter's value is a number");
  assert.equal(edit.parameterProblem([{ name: 'T', type: 'text', value: 1 }]), "T: a text parameter's value is a text");
  assert.equal(edit.parameterProblem([{ name: 'T', type: 'text', value: 'a', max: 3 }]), 'T: min, max and step are for number parameters');
  assert.equal(edit.parameterProblem([{ ...ok, choices: ['a'] }]), 'Growth: choices are for text parameters');
  assert.equal(edit.parameterProblem([{ ...ok, min: 2 }]), 'Growth: the minimum is above the maximum');
  const report = { model: {} } as Report;
  assert.throws(() => edit.setParameters(report, [ok, ok]), (e: unknown) => e instanceof edit.EditError && e.message === 'Two parameters are named Growth');
  assert.equal(report.model.parameters, undefined, 'a refused list changes nothing');
});

test('two columns are related already either way round, except by the relationship being changed', () => {
  const report = { model: { relationships: [{ from: 'sales.customer_id', to: 'customers.id' }] } } as Report;
  assert.equal(edit.relatedAlready(report, { from: 'sales.customer_id', to: 'customers.id' }), true);
  assert.equal(edit.relatedAlready(report, { from: 'customers.id', to: 'sales.customer_id' }), true);
  assert.equal(edit.relatedAlready(report, { from: 'sales.customer_id', to: 'customers.id' }, 0), false);
  assert.equal(edit.relatedAlready(report, { from: 'sales.product_id', to: 'products.id' }), false);
});
