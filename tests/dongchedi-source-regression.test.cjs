const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/dongchedi-user/index.html', 'utf8');
const source = fs.readFileSync('public/dongchedi-user/app.js', 'utf8');

test('dongchedi archive uses shared utilities and self-hosted Lucide', () => {
  assert.match(html, /\.\.\/design-system\.css/);
  assert.match(html, /\.\.\/shared-browser-utils\.js/);
  assert.match(html, /\.\.\/vendor\/lucide\.min\.js/);
  assert.match(html, /data-lucide="radio-tower"/);
  assert.doesNotMatch(html, /<script[^>]+https?:\/\//i);
});

test('dongchedi archive consumes the normalized daily snapshot', () => {
  assert.match(source, /fetch\('\/api\/dongchedi-profile'/);
  assert.match(source, /swnb_dongchedi_snapshot_v1/);
  assert.match(source, /PAGE_SIZE = 12/);
  assert.match(html, /data-sort="latest"/);
  assert.match(html, /data-sort="popular"/);
  assert.match(html, /id="postSearch"/);
  assert.match(html, /id="articleModal"/);
});

test('dongchedi archive only accepts trusted media and source hosts', () => {
  assert.match(source, /'byteimg\.com', 'dcarimg\.com', 'byteacctimg\.com'/);
  assert.match(source, /'dongchedi\.com', 'dcdapp\.com'/);
  assert.match(source, /escapeHtml\(post\.content/);
  assert.doesNotMatch(html, /javascript:/i);
});

test('dongchedi archive contains no fake interactions or inline handlers', () => {
  assert.doesNotMatch(source, /postsData|toggleLike|submitComment|toggleFollow/);
  assert.doesNotMatch(html, /\son(click|change|load|keydown)=/i);
  assert.match(html, /每日同步/);
});
