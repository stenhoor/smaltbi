// "Add date table" (ADR 0006, decision 6): the calendar step runs on the real engine with the sample data, relates to
// the sales dates, and the model queries through it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDateTable, planDateTable, removeDateTable } from '../src/core/datetable.js';
import { compileQuery } from '../src/core/compile.js';
import { Model } from '../src/core/model.js';
import { introspect } from '../src/data/introspect.js';
import { sampleSession } from './helpers.js';

type Row = Record<string, unknown>;

async function withCalendar(opts: Parameters<typeof planDateTable>[0]) {
  const s = await sampleSession();
  const report = structuredClone(s.report);
  const plan = addDateTable(report, opts);
  await s.db.exec((plan.step as { sql: string }).sql);
  const schema = await introspect(s.db);
  return { ...s, report, plan, model: new Model(schema, report.model) };
}

test('the calendar covers whole years around the source dates, one row per day', async () => {
  const { db } = await withCalendar({ source: 'sales.order_date' });
  const [span] = (await db.query("SELECT min(order_date) AS lo, max(order_date) AS hi FROM sales")) as Row[];
  const [cal] = (await db.query('SELECT min(date) AS lo, max(date) AS hi, count(*) AS n, count(DISTINCT date) AS days FROM calendar')) as Row[];
  assert.equal(cal!.lo, `${String(span!.lo).slice(0, 4)}-01-01`);
  assert.equal(cal!.hi, `${String(span!.hi).slice(0, 4)}-12-31`);
  assert.equal(cal!.n, cal!.days);
  const [d] = (await db.query("SELECT year, quarter, month, month_name, year_month, day, day_of_week, day_name, week_start FROM calendar WHERE date = '2025-03-05'")) as Row[];
  // 5 March 2025 is a Wednesday: day 3 of a Monday week that starts on 3 March.
  assert.deepEqual({ ...d }, { year: '2025', quarter: 'Q1', month: 3, month_name: 'Mar', year_month: '2025-03', day: 5, day_of_week: 3, day_name: 'Wed', week_start: '2025-03-03' });
});

test('fiscal year: named by the year it ends in; ISO weeks; Sunday weeks', async () => {
  const { db } = await withCalendar({ source: 'sales.order_date', fiscalStart: 7, weekStart: 0, isoWeeks: true });
  const rows = (await db.query("SELECT date, fiscal_year, fiscal_quarter, fiscal_month, fiscal_month_name, iso_year, iso_week, iso_year_week, day_of_week, week_start FROM calendar WHERE date IN ('2024-06-30', '2024-07-01', '2025-01-01', '2024-12-30') ORDER BY date")) as Row[];
  assert.deepEqual(rows.map((r) => ({ ...r })), [
    // A Sunday: day 1 of a Sunday week.
    { date: '2024-06-30', fiscal_year: 'FY2024', fiscal_quarter: 'FQ4', fiscal_month: 12, fiscal_month_name: 'Jun', iso_year: '2024', iso_week: 26, iso_year_week: '2024-W26', day_of_week: 1, week_start: '2024-06-30' },
    { date: '2024-07-01', fiscal_year: 'FY2025', fiscal_quarter: 'FQ1', fiscal_month: 1, fiscal_month_name: 'Jul', iso_year: '2024', iso_week: 27, iso_year_week: '2024-W27', day_of_week: 2, week_start: '2024-06-30' },
    // 30 December 2024 is in ISO week 1 of 2025.
    { date: '2024-12-30', fiscal_year: 'FY2025', fiscal_quarter: 'FQ2', fiscal_month: 6, fiscal_month_name: 'Dec', iso_year: '2025', iso_week: 1, iso_year_week: '2025-W01', day_of_week: 2, week_start: '2024-12-29' },
    { date: '2025-01-01', fiscal_year: 'FY2025', fiscal_quarter: 'FQ3', fiscal_month: 7, fiscal_month_name: 'Jan', iso_year: '2025', iso_week: 1, iso_year_week: '2025-W01', day_of_week: 4, week_start: '2024-12-29' },
  ]);
  // The range runs from the first fiscal year's start to the last one's end.
  const [cal] = (await db.query('SELECT min(date) AS lo, max(date) AS hi FROM calendar')) as Row[];
  assert.match(String(cal!.lo), /^\d{4}-07-01$/);
  assert.match(String(cal!.hi), /^\d{4}-06-30$/);
});

test('the model queries through the date table: revenue by year and month, months in calendar order', async () => {
  const { model, runner, plan } = await withCalendar({ source: 'sales.order_date' });
  assert.deepEqual(plan.relationship, { from: 'sales.order_date', to: 'calendar.date' });
  const q = compileQuery(model, { dims: [model.resolve('calendar.year'), model.resolve('calendar.month_name')], measures: [model.resolve('sales.Revenue')] });
  assert.match(q.sql, /JOIN "calendar" ON "sales"\."order_date" = "calendar"\."date"/);
  const f = await runner.run(q.sql);
  // Columns: d0 year, d1 month name, s1 (month name's sort column, month), m0 revenue.
  const months = Array.from(f.data.d1!).slice(0, 12);
  assert.deepEqual(months, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  const total = Array.from(f.data.m0! as ArrayLike<number>).reduce((a, b) => a + (b ?? 0), 0);
  const direct = await runner.run(compileQuery(model, { dims: [], measures: [model.resolve('sales.Revenue')] }).sql);
  assert.ok(Math.abs(total - Number(Object.values(direct.data)[0]![0])) < 1e-6, 'every sale lands on a calendar day');
});

test('hierarchies, labels and removal', async () => {
  const { report, plan } = await withCalendar({ source: 'sales.order_date', fiscalStart: 4, isoWeeks: true });
  assert.deepEqual(plan.hierarchies.map((h) => `${h.name}: ${h.levels.join(' › ')}`), [
    'Calendar: year › quarter › month_name › date',
    'Fiscal calendar: fiscal_year › fiscal_quarter › fiscal_month_name › date',
    'ISO weeks: iso_year › iso_year_week › date',
  ]);
  assert.equal(report.model.tables!.calendar!.columns!.month_name!.sortBy, 'month');
  assert.equal(report.model.dateTable!.fiscalStart, 4);
  // Replacing keeps one date table.
  addDateTable(report, { source: 'sales.order_date', table: 'calendar' });
  assert.equal(report.data.steps!.filter((s) => 'sql' in s).length, 1);
  assert.equal(report.model.relationships!.filter((r) => r.to === 'calendar.date').length, 1);
  removeDateTable(report);
  assert.equal(report.model.dateTable, undefined);
  assert.equal(report.data.steps!.some((s) => 'sql' in s), false);
  assert.equal(report.model.hierarchies!.some((h) => h.table === 'calendar'), false);
  assert.throws(() => planDateTable({ source: 'order_date' }), /table\.column/);
  assert.throws(() => addDateTable(report, { source: 'sales.order_date', table: 'sales' }), /already creates a table named "sales"/);
});
