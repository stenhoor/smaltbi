// Plugin integrity and trust (plugins/loader.ts). Loading itself (fetch, blob import, setup) is tested in the browser
// by the e2e test, with examples/plugins/bullet.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkIntegrity, integrityOf, untrustedPlugins } from '../src/plugins/loader.js';

const bytes = new TextEncoder().encode('export default { setup() {} }\n').buffer;
const sri = (algo: string) => `${algo}-${createHash(algo).update(new Uint8Array(bytes)).digest('base64')}`;

test('integrity: the SRI value of the bytes, and matching any listed hash', async () => {
  assert.equal(await integrityOf(bytes), sri('sha384'));
  assert.equal(await integrityOf(bytes, 'sha256'), sri('sha256'));
  assert.ok(await checkIntegrity(bytes, sri('sha384')));
  assert.ok(await checkIntegrity(bytes, `sha512-AAAA ${sri('sha256')}`), 'any of several');
  assert.equal(await checkIntegrity(bytes, 'sha384-AAAA'), false, 'a changed file is refused');
  assert.equal(await checkIntegrity(bytes, ''), false, 'no hash, no load');
  assert.equal(await checkIntegrity(bytes, 'md5-xyz'), false, 'unknown algorithms are not trusted');
});

test('trust: plugins of a report from this site load; from elsewhere they need a yes', () => {
  const refs = [{ url: 'plugins/bullet.js', integrity: sri('sha384') }];
  assert.deepEqual(untrustedPlugins(refs, 'https://reports.example.com/r/report.json', 'https://reports.example.com'), []);
  assert.deepEqual(untrustedPlugins(refs, 'https://other.example.org/report.json', 'https://reports.example.com'), refs);
  assert.deepEqual(untrustedPlugins(undefined, 'https://other.example.org/report.json', 'https://reports.example.com'), []);
});
