// Time-intelligence quick measures (core/timeintel.ts) on the real engine with the sample data and a date table. Each
// result is checked against a direct query over the same dates, so the windows, the filters and the joins are tested
// together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDateTable } from '../src/core/datetable.js';
import { compileQuery } from '../src/core/compile.js';
import { Model, ModelError } from '../src/core/model.js';
import { introspect } from '../src/data/introspect.js';
import type { Filter, Measure, Report, TimeCalcKind } from '../src/core/types.js';
import { sampleSession } from './helpers.js';

const s = await sampleSession();
const LINE = 'sales.quantity * sales.unit_price * (1 - sales.discount)';

async function modelWith(fiscalStart = 1, extra: Measure[] = []): Promise<Model> {
  const report: Report = structuredClone(s.report);
  const plan = addDateTable(report, { source: 'sales.order_date', table: `cal${fiscalStart}`, fiscalStart });
  if (!(await s.db.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'cal${fiscalStart}'`) as unknown[]).length) await s.db.exec((plan.step as { sql: string }).sql);
  const quick = (calc: TimeCalcKind, of = 'Revenue', months?: number): Measure => ({ table: 'sales', name: `${of} ${calc}${months ?? ''}`, sql: '', time: { of, calc, ...(months ? { months } : {}) } });
  report.model.measures = [
    ...(report.model.measures ?? []),
    ...(['ytd', 'qtd', 'mtd', 'py', 'yoy', 'yoy%', 'pm', 'pq'] as TimeCalcKind[]).map((c) => quick(c)),
    quick('rolling', 'Revenue', 3),
    quick('ytd', 'Active Customers'),
    quick('ytd', 'Margin %'),
    ...extra,
  ];
  return new Model(await introspect(s.db), report.model);
}

/** Run a visual's query: rows as objects keyed by d0…, m0…. */
async function rows(model: Model, dims: string[], measures: string[], filters: Filter[] = []): Promise<Record<string, unknown>[]> {
  const q = compileQuery(model, { dims: dims.map((d) => model.resolve(d)), measures: measures.map((m) => model.resolve(m, 'measure')), filters });
  const f = await s.runner.run(q.sql);
  return Array.from({ length: f.length }, (_, r) => Object.fromEntries(Object.entries(f.data).map(([k, v]) => [k, (v as ArrayLike<unknown>)[r]])));
}

/** The direct answer: revenue (or another aggregate) of the sales between two dates, with an optional extra condition. */
async function direct(from: string, to: string, agg = `SUM(${LINE})`, where = '1'): Promise<number | null> {
  const [r] = (await s.db.query(`SELECT ${agg} AS v FROM sales LEFT JOIN products ON sales.product_id = products.id WHERE sales.order_date BETWEEN '${from}' AND '${to}' AND ${where}`)) as { v: number | null }[];
  return r!.v;
}

const close = (a: unknown, b: number | null, msg: string) => {
  if (b === null) assert.equal(a, null, msg);
  else assert.ok(typeof a === 'number' && Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${msg}: ${a} ≠ ${b}`);
};

test('year to date, quarter to date and month to date by month', async () => {
  const m = await modelWith();
  const r = await rows(m, ['cal1.year_month'], ['sales.Revenue', 'sales.Revenue ytd', 'sales.Revenue qtd', 'sales.Revenue mtd']);
  const may = r.find((x) => x.d0 === '2025-05')!;
  close(may.m1, await direct('2025-01-01', '2025-05-31'), 'YTD at May 2025');
  close(may.m2, await direct('2025-04-01', '2025-05-31'), 'QTD at May 2025');
  close(may.m3, may.m0 as number, 'MTD of a whole month is the month');
  // YTD restarts each January.
  const jan = r.find((x) => x.d0 === '2025-01')!;
  close(jan.m1, jan.m0 as number, 'YTD in January is January');
});

test('same period last year, change and % change, previous month and quarter, rolling months', async () => {
  const m = await modelWith();
  const r = await rows(m, ['cal1.year_month'], ['sales.Revenue', 'sales.Revenue py', 'sales.Revenue yoy', 'sales.Revenue yoy%', 'sales.Revenue pm', 'sales.Revenue pq', 'sales.Revenue rolling3']);
  const mar = r.find((x) => x.d0 === '2025-03')!;
  const ly = (await direct('2024-03-01', '2024-03-31'))!;
  close(mar.m1, ly, 'last year');
  close(mar.m2, (mar.m0 as number) - ly, 'change vs last year');
  close(mar.m3, ((mar.m0 as number) - ly) / ly, '% change vs last year');
  close(mar.m4, await direct('2025-02-01', '2025-02-28'), 'previous month');
  close(mar.m5, await direct('2024-12-01', '2024-12-31'), 'previous quarter (three months back)');
  close(mar.m6, await direct('2025-01-01', '2025-03-31'), 'rolling 3 months');
  // The first year has nothing to compare with.
  assert.equal(r.find((x) => x.d0 === '2021-03')!.m1, null);
});

test('non-additive measures are aggregated over the window, not summed', async () => {
  const m = await modelWith();
  const r = await rows(m, ['cal1.year_month'], ['sales.Active Customers ytd', 'sales.Margin % ytd']);
  const jun = r.find((x) => x.d0 === '2025-06')!;
  close(jun.m0, await direct('2025-01-01', '2025-06-30', 'COUNT(DISTINCT sales.customer_id)'), 'distinct customers YTD');
  close(jun.m1, await direct('2025-01-01', '2025-06-30', `(SUM(${LINE}) - SUM(sales.quantity * products.unit_cost)) / NULLIF(SUM(${LINE}), 0)`), 'margin % YTD');
});

test('filters: other tables filter the facts, date filters pick the periods; other fields split the rows', async () => {
  const m = await modelWith();
  const tea: Filter = { field: 'products.category', op: 'in', values: ['Tea'] };
  const r = await rows(m, ['cal1.year', 'products.category'], ['sales.Revenue py'], [tea, { field: 'cal1.year', op: 'in', values: ['2025'] }]);
  assert.deepEqual(r.map((x) => [x.d0, x.d1]), [['2025', 'Tea']]);
  close(r[0]!.m0, await direct('2024-01-01', '2024-12-31', `SUM(${LINE})`, "products.category = 'Tea'"), 'Tea, last year');
  // A card: no fields, a date slicer on Q1 2025. YTD is as of the end of the selection.
  const [card] = await rows(m, [], ['sales.Revenue ytd', 'sales.Revenue py'], [{ field: 'cal1.year', op: 'in', values: ['2025'] }, { field: 'cal1.quarter', op: 'in', values: ['Q1'] }]);
  close(card!.m0, await direct('2025-01-01', '2025-03-31'), 'card YTD');
  close(card!.m1, await direct('2024-01-01', '2024-03-31'), 'card last year');
});

test('a fiscal year starting in July', async () => {
  const m = await modelWith(7);
  const r = await rows(m, ['cal7.year_month'], ['sales.Revenue ytd', 'sales.Revenue qtd']);
  const aug = r.find((x) => x.d0 === '2025-08')!;
  close(aug.m0, await direct('2025-07-01', '2025-08-31'), 'fiscal YTD restarts in July');
  close(aug.m1, await direct('2025-07-01', '2025-08-31'), 'fiscal Q1 is July to September');
  const may = r.find((x) => x.d0 === '2025-05')!;
  close(may.m0, await direct('2024-07-01', '2025-05-31'), 'fiscal YTD runs from the previous July');
  close(may.m1, await direct('2025-04-01', '2025-05-31'), 'fiscal Q4 starts in April');
});

test('the SQL is one statement, and errors explain themselves', async () => {
  const m = await modelWith();
  const q = compileQuery(m, { dims: [m.resolve('cal1.year')], measures: [m.resolve('sales.Revenue ytd', 'measure')] });
  assert.match(q.sql, /^WITH ti_q AS \(/);
  assert.equal(q.sql.match(/;/g), null);
  // Without a date table.
  const plain = new Model(s.schema, { ...s.report.model, dateTable: undefined, measures: [...(s.report.model.measures ?? []), { table: 'sales', name: 'YTD', sql: '', time: { of: 'Revenue', calc: 'ytd' } }] });
  assert.throws(() => compileQuery(plain, { dims: [], measures: [plain.resolve('sales.YTD', 'measure')] }), (e: unknown) => e instanceof ModelError && /Add date table/.test((e as Error).message));
  // Used inside another measure's SQL.
  const nested = await modelWith(1, [{ table: 'sales', name: 'Bad', sql: '[Revenue ytd] * 2' }]);
  assert.throws(() => nested.resolve('sales.Bad', 'measure'), /time-intelligence measure/);
  // A filter on a time measure is reported, not applied.
  const fq = compileQuery(m, { dims: [m.resolve('cal1.year')], measures: [m.resolve('sales.Revenue ytd', 'measure')], filters: [{ field: 'sales.Revenue ytd', op: 'gt', values: [1] }] });
  assert.equal(fq.ignored.length, 1);
});
