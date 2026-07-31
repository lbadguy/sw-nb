const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const source = fs.readFileSync('public/app.js', 'utf8');
const styles = fs.readFileSync('public/style.css', 'utf8');
const systemStyles = fs.readFileSync('public/design-system.css', 'utf8');
const worker = fs.readFileSync('worker.js', 'utf8');

test('main page self-hosts Lucide and has no inline event handlers or remote scripts', () => {
  assert.match(html, /vendor\/lucide\.min\.js/);
  assert.match(html, /data-lucide="square-pen"/);
  assert.doesNotMatch(html, /<script[^>]+https?:\/\//i);
  assert.doesNotMatch(html, /\son(click|change|load|dblclick|keydown)=/i);
});

test('main page ships local subject imagery and unified visual system', () => {
  assert.match(html, /design-system\.css/);
  assert.match(html, /assets\/wagon-hero\.jpg/);
  assert.match(html, /id="signalCanvas"/);
  assert.match(styles, /\.hero-stage/);
  assert.match(styles, /\.project-split/);
  assert.equal(fs.existsSync('public/assets/wagon-hero.jpg'), true);
  assert.equal(fs.existsSync('public/assets/road-story.jpg'), true);
  assert.equal(fs.existsSync('public/assets/machine-detail.jpg'), true);
});

test('theme tokens and reduced motion are defined centrally', () => {
  assert.match(systemStyles, /\[data-theme="light"\]/);
  assert.match(systemStyles, /--signal:\s*#d9ff43/);
  assert.match(systemStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(source, /swnb_theme/);
  assert.match(source, /document\.documentElement\.dataset\.theme/);
});

test('main app reads public posts directly and proxies every mutation', () => {
  assert.match(source, /\/rest\/v1\/posts\?select=\*/);
  assert.match(source, /function callBlogApi/);
  assert.match(source, /callBlogApi\('\/admin\/verify'/);
  assert.match(source, /callBlogApi\('\/posts\/view'/);
  assert.match(source, /callBlogApi\('\/posts\/create'/);
  assert.match(source, /callBlogApi\('\/posts\/update'/);
  assert.match(source, /callBlogApi\('\/posts\/delete'/);
  assert.doesNotMatch(source, /ADMIN_PASSWORD_HASH/);
});

test('main app renders cached posts before cloud synchronization', () => {
  const loadPosts = source.match(/async function loadPosts\(\) \{[\s\S]*?\n\}/);
  assert.ok(loadPosts);
  assert.match(loadPosts[0], /loadCachedPosts\(\)/);
  assert.match(loadPosts[0], /renderPosts\(\)/);
  assert.match(loadPosts[0], /await fetchPosts\(\)/);
});

test('activity dashboard is explicitly local and no longer collects public IPs', () => {
  assert.match(html, /LOCAL DEVICE ONLY/);
  assert.match(html, /仅存在于当前浏览器/);
  assert.match(source, /swnb_local_activity_v2/);
  assert.doesNotMatch(source, /api\.ipify|visitor-ip|currentVisitorIp/);
  assert.doesNotMatch(worker, /visitor-ip|CF-Connecting-IP/);
});

test('editor constrains image count, size and protocols', () => {
  assert.match(source, /MAX_IMAGES = 6/);
  assert.match(source, /MAX_IMAGE_BYTES = 8 \* 1024 \* 1024/);
  assert.match(source, /url\.protocol === 'https:'/);
  assert.match(source, /setEditorBusy\(true\)/);
  assert.match(html, /id="editorSubmit"/);
});

test('worker emits a strict self-hosted script policy', () => {
  assert.match(worker, /"script-src 'self'"/);
  assert.match(worker, /X-Content-Type-Options/);
  assert.match(worker, /Permissions-Policy/);
  assert.doesNotMatch(worker, /script-src[^\n]+unsafe-inline/);
  assert.match(fs.readFileSync('wrangler.jsonc', 'utf8'), /"run_worker_first"\s*:\s*true/);
});

test('mobile layouts keep primary actions and fixed-format content stable', () => {
  assert.match(styles, /@media \(max-width: 620px\)/);
  assert.match(styles, /\.hero-grid[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(styles, /\.post-entry[\s\S]*grid-template-columns:/);
  assert.match(styles, /\.project-panel[\s\S]*min-height:/);
});

test('both subprojects use the shared design system and self-hosted icons', () => {
  for (const file of ['public/bro-phone/index.html', 'public/dongchedi-user/index.html']) {
    const subpage = fs.readFileSync(file, 'utf8');
    assert.match(subpage, /\.\.\/design-system\.css/);
    assert.match(subpage, /\.\.\/vendor\/lucide\.min\.js/);
    assert.doesNotMatch(subpage, /<script[^>]+https?:\/\//i);
    assert.doesNotMatch(subpage, /\son(click|change|load)=/i);
  }
});
