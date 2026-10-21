/* global __dirname */
// Runs without Metro, network, device secrets or a backend.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: name => {
    if (!(name in mocks)) throw new Error('Unexpected import: ' + name);
    return mocks[name];
  }, URL, AbortController, setTimeout, clearTimeout, ...globals });
  return exports;
}

async function main() {
  let secret = 'a'.repeat(64);
  let storageFailure = false;
  let calls = [];
  let response = { ok: true, json: async () => ({ reports: [] }) };
  const env = { EXPO_PUBLIC_REPORTS_API_URL: 'https://reports.example.test' };
  const api = load('src/services/reports-api.ts', {
    './report-identity': { reportIdentity: async () => { if (storageFailure) throw Error(); return secret; } },
  }, { process: { env }, __DEV__: false, fetch: async (url, options) => { calls.push({ url, options }); return response; } });
  await api.listReports();
  assert.equal(calls[0].url, 'https://reports.example.test/api/reports');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + secret);
  assert.equal(calls[0].url.includes(secret), false);
  assert.equal(calls[0].options.cache, 'no-store');
  for (const [status, code] of [[429, 'limited'], [503, 'unavailable'], [422, 'validation'], [413, 'validation'], [409, 'conflict']]) {
    response = { ok: false, status };
    await assert.rejects(api.listReports(), error => error.code === code);
  }
  storageFailure = true;
  const before = calls.length;
  await assert.rejects(api.listReports(), error => error.code === 'storage');
  assert.equal(calls.length, before);
  storageFailure = false;
  env.EXPO_PUBLIC_REPORTS_API_URL = 'http://reports.example.test';
  await assert.rejects(api.listReports(), error => error.code === 'configuration');
  env.EXPO_PUBLIC_REPORTS_API_URL = 'https://user:password@reports.example.test';
  await assert.rejects(api.listReports(), error => error.code === 'configuration');
  env.EXPO_PUBLIC_REPORTS_API_URL = 'https://reports.example.test';
  response = { ok: true, json: async () => ({}) };
  await assert.rejects(api.listReports(), error => error.code === 'unavailable');
  await assert.rejects(api.submitReport({}), error => error.code === 'unavailable');
  response = { ok: true, json: async () => ({ id: 'AFH-1234567890ABCDEF', status: 'received', kind: 'bug', title: 'Sample', created_at: 1, updated_at: 1 }) };
  const draft = { request_id: 'stable-retry-id', title: 'Sample' };
  await api.submitReport(draft);
  await api.submitReport(draft);
  assert.equal(calls.at(-1).options.body, calls.at(-2).options.body);
  let saved;
  const identity = load('src/services/report-identity.ts', {}, {
    sessionStorage: { getItem: () => saved, setItem: (_, v) => { saved = v; } },
    crypto: { getRandomValues: bytes => bytes.fill(7) },
  });
  const first = await identity.reportIdentity();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(await identity.reportIdentity(), first);
  const copy = load('src/constants/reports-copy.ts', {});
  for (const lang of ['zh-TW', 'ja', 'en']) {
    assert.ok(copy.reportsCopy(lang).errors.network);
    assert.ok(copy.reportsCopy(lang).statuses.reviewing);
  }
  console.log('PASS: credential headers, storage failure, production HTTPS, error mapping, stable retries, session identity, three languages.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
