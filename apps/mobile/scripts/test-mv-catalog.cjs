const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ts = require('typescript');
function load(relative) {
  const result = {};
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports: result });
  return result;
}
const { indexMvVideos, searchMvVideos, normalizeMvSearch } = load('src/services/mv-search.ts');
const { isMvCatalog } = load('src/services/mv-api.ts');
const video = (id, categories, views, date = '2026-01-01T00:00:00Z') => ({
  like_count: null, id, title: 'うっせぇわ', categories, view_count: views, published_at: date,
  thumbnail_url: null, url: `https://www.youtube.com/watch?v=${id}`,
  channel_id: 'UC' + 'a'.repeat(22), channel_title: 'Publisher', playlist_ids: ['playlist'],
  aliases: ['うっせぇわ (Usseewa)'],
});
const input = [video('abcdefghijk', ['original'], 20), video('abcdefghijk', ['live'], 20),
  video('lmnopqrstuv', ['live'], null), video('ABCDEFGHIJK', ['cover'], 20, '2025-01-01T00:00:00Z')];
const before = JSON.stringify(input);
const index = indexMvVideos(input);
assert.equal(index.length, 3);
assert.equal(searchMvVideos(index, ' ＵＳＳＥＥＷＡ ', 'live', 'popular').length, 2);
assert.deepEqual(Array.from(searchMvVideos(index, '', 'all', 'popular'), v => v.id), ['abcdefghijk', 'ABCDEFGHIJK', 'lmnopqrstuv']);
assert.equal(searchMvVideos(index, 'no matching title', 'all', 'newest').length, 0);
assert.equal(searchMvVideos(index, '', 'all', 'oldest')[0].id, 'ABCDEFGHIJK');
assert.equal(normalizeMvSearch('ライブ'), normalizeMvSearch('らいぶ'));
assert.equal(normalizeMvSearch('café'), 'cafe');
assert.equal(JSON.stringify(input), before);
const response = { source: 'test', fetched_at: '2026-01-01T00:00:00Z', cached: false, partial: false,
  sources: [{ id: 'playlist', title: 'test', available: true, item_count: 1 }], videos: [input[0]], unavailable_video_ids: [] };
assert(isMvCatalog(response));
assert(!isMvCatalog({ ...response, videos: [{ ...input[0], categories: ['made-up'] }] }));
assert(!isMvCatalog({ ...response, videos: [{ ...input[0], view_count: -1 }] }));
assert(!isMvCatalog({ ...response, videos: [{ ...input[0], url: 'https://example.com' }] }));
assert(!isMvCatalog({ ...response, sources: [{ ...response.sources[0], available: false }] }));
assert(!isMvCatalog(null));
assert(isMvCatalog({ ...response, videos: [{ ...input[0], like_count: 0 }] }));
assert(!isMvCatalog({ ...response, videos: [{ ...input[0], like_count: -1 }] }));
console.log('PASS: source validation, official aliases, normalization, category union, sorting, null counts, empty results and input immutability.');
