const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

let modulePromise;
function loadWorkerModule() {
  if (!modulePromise) {
    const source = fs.readFileSync('worker.js', 'utf8');
    modulePromise = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  }
  return modulePromise;
}

test('wrangler restores the production KV and daily schedule', () => {
  const source = fs.readFileSync('wrangler.jsonc', 'utf8');
  assert.match(source, /"run_worker_first"\s*:\s*true/);
  assert.match(source, /"binding"\s*:\s*"DONGCHEDI_CACHE"/);
  assert.match(source, /a958bcd6382c4f469f077c40d0997d5b/);
  assert.match(source, /"DONGCHEDI_USER_ID"\s*:\s*"485359118462679"/);
  assert.match(source, /"17 20 \* \* \*"/);
  assert.doesNotMatch(source, /REPLACE_WITH_KV/);
});

test('Worker uses the current public profile endpoints', () => {
  const source = fs.readFileSync('worker.js', 'utf8');
  assert.match(source, /\/motor\/pc\/user\/profile\/all_info/);
  assert.match(source, /\/motor\/pc\/user\/profile\/user_info/);
  assert.match(source, /aid: '1839'/);
  assert.match(source, /app_name: 'auto_web_pc'/);
  assert.doesNotMatch(source, /\/motor\/pc\/content\/ugc\/user_dynamic/);
  assert.doesNotMatch(source, /\/motor\/pc\/content\/ugc\/user_info/);
});

test('static assets receive strict same-origin security headers', async () => {
  const worker = await loadWorkerModule();
  const response = await worker.default.fetch(
    new Request('https://example.com/'),
    { ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }) } },
    { waitUntil() {} },
  );
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response.headers.get('Content-Security-Policy'), /script-src 'self'/);
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'self'/);
  assert.equal(response.headers.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.match(response.headers.get('Permissions-Policy'), /geolocation=\(\)/);
});

test('health endpoint is read-only and never cached', async () => {
  const worker = await loadWorkerModule();
  const env = { ASSETS: { fetch: async () => new Response('asset') } };
  const context = { waitUntil() {} };
  const ok = await worker.default.fetch(new Request('https://example.com/api/health'), env, context);
  const denied = await worker.default.fetch(new Request('https://example.com/api/health', { method: 'POST' }), env, context);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { status: 'ok', version: 3 });
  assert.equal(ok.headers.get('Cache-Control'), 'no-store');
  assert.equal(denied.status, 405);
});

test('dongchedi endpoint serves the cached snapshot with validators', async () => {
  const worker = await loadWorkerModule();
  const snapshot = {
    schemaVersion: 1,
    userId: '485359118462679',
    sourceUrl: 'https://www.dongchedi.com/user/485359118462679',
    refreshedAt: new Date().toISOString(),
    profile: { name: '我要娶一个旅行车' },
    posts: [{ id: '1', title: '公开动态', images: [] }],
    sync: { cadence: 'daily' },
  };
  const env = {
    ASSETS: { fetch: async () => new Response('asset') },
    DONGCHEDI_CACHE: { get: async () => snapshot },
    DONGCHEDI_USER_ID: '485359118462679',
  };
  const response = await worker.default.fetch(
    new Request('https://example.com/api/dongchedi-profile'),
    env,
    { waitUntil() {} },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.posts.length, 1);
  assert.equal(body.cache.status, 'fresh');
  assert.match(response.headers.get('ETag'), /^W\/"dcd-/);
  assert.match(response.headers.get('Cache-Control'), /stale-while-revalidate=86400/);
});
