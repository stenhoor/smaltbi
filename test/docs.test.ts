// The documentation is tested (smalt-brand BRAND.md, Documentation, rule 5): the generated visual pages match the
// registry, and every JSON example in the guide and the reference parses. A full report in an example (one with
// "smaltbi": 1) loads its data, its model validates, and every visual in it compiles and runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SUMMARIES, visualDocs } from '../src/docs/visuals.js';
import { visualDefs } from '../src/visuals/index.js';
import { visualDef } from '../src/visuals/api.js';
import { compileQuery } from '../src/core/compile.js';
import { Model, bindParams } from '../src/core/model.js';
import { introspect } from '../src/data/introspect.js';
import { QueryRunner } from '../src/data/runner.js';
import type { Report } from '../src/core/types.js';
import { clientDb, nodeIo, root } from './helpers.js';

const docs = join(root, 'docs');

function mdFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? mdFiles(p) : f.endsWith('.md') ? [p] : [];
  });
}

/** The ```json fences of a Markdown file, with their line numbers. */
function jsonFences(file: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)```json\s*$/.exec(lines[i]!);
    if (!open) continue;
    const start = i + 1;
    const body: string[] = [];
    while (++i < lines.length && !/^\s*```\s*$/.test(lines[i]!)) body.push(lines[i]!.slice(open[1]!.length));
    out.push({ line: start, text: body.join('\n') });
  }
  return out;
}

test('the visual types pages are up to date (npm run docs:visuals writes them)', () => {
  const dir = join(docs, 'reference/visuals');
  const want = visualDocs();
  const have = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.deepEqual(have.sort(), [...want.keys()].sort(), 'the pages are the generated ones: run npm run docs:visuals');
  for (const [name, text] of want) assert.equal(readFileSync(join(dir, name), 'utf8'), text, `${name} is out of date: run npm run docs:visuals`);
});

test('every built-in visual type has a summary', () => {
  for (const d of visualDefs().filter((d) => d.group !== 'plugin')) assert.ok(SUMMARIES[d.type], `SUMMARIES has no line for ${d.type}`);
});

/** Loads a report's data (files relative to the repository), and runs every visual in it. */
async function runReport(report: Report, where: string) {
  const db = clientDb();
  for (const s of report.data.steps ?? []) {
    if ('import' in s) {
      const text = readFileSync(join(root, s.import), 'utf8');
      const format = s.format ?? s.import.split('.').pop();
      if (format === 'csv') await nodeIo.importCSV(db, s.table, text, { create: true });
      else await nodeIo.importJSON(db, s.table, text, { create: true } as never);
    } else if ('sql' in s) await db.exec(s.sql);
    else assert.fail(`${where}: the docs test runs import and sql steps only`);
  }
  const model = new Model(await introspect(db), report.model);
  assert.deepEqual(model.validate(), [], `${where}: the model`);
  const runner = new QueryRunner(db);
  let visuals = 0;
  for (const page of report.pages) {
    for (const v of page.visuals) {
      const def = visualDef(v.type);
      assert.ok(def, `${where}: visual type ${v.type}`);
      for (const role of Object.keys(v.fields)) assert.ok(def.roles.some((r) => r.name === role), `${where}: ${v.type} has no role ${role}`);
      const fields = Object.fromEntries(def.roles.map((role) => {
        let refs = model.expand(v.fields[role.name] ?? []);
        if (role.drill) refs = refs.slice(0, 1);
        return [role.name, refs.map((r) => model.resolve(r, role.kind))];
      }));
      const dims = def.roles.filter((r) => r.kind === 'dimension').flatMap((r) => fields[r.name]!);
      const measures = def.roles.filter((r) => r.kind === 'measure').flatMap((r) => fields[r.name]!);
      if (!dims.length && !measures.length) continue;
      const q = compileQuery(model, { dims, measures, limit: 100 });
      const f = await runner.run(bindParams(q.sql, model));
      assert.ok(f.length > 0, `${where}: ${page.id}/${v.id} returns rows`);
      visuals++;
    }
  }
  assert.ok(visuals > 0, `${where}: runs at least one visual`);
}

for (const file of [...mdFiles(join(docs, 'guide')), ...mdFiles(join(docs, 'reference'))]) {
  const fences = jsonFences(file);
  if (!fences.length) continue;
  test(`the JSON examples in ${relative(root, file)} are valid`, async () => {
    for (const { line, text } of fences) {
      const where = `${relative(root, file)}:${line}`;
      let value: unknown;
      assert.doesNotThrow(() => (value = JSON.parse(text)), `${where} is not JSON`);
      if (value && typeof value === 'object' && (value as { smaltbi?: unknown }).smaltbi === 1) await runReport(value as Report, where);
    }
  });
}
