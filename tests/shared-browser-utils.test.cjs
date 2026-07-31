const test = require('node:test');
const assert = require('node:assert/strict');

const {
  escapeHtml,
  formatRelativeTime,
  getOrCreateVisitorKey,
  getViewWindowStart,
  htmlToPlainText,
  normalizePostRecord,
  safeStorageSet,
} = require('../public/shared-browser-utils.js');

test('escapeHtml escapes dangerous characters', () => {
  assert.equal(escapeHtml('<img src=x onerror=1>'), '&lt;img src=x onerror=1&gt;');
});

test('getOrCreateVisitorKey persists and reuses one key', () => {
  const storage = new Map();
  const api = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, value);
    },
  };

  const first = getOrCreateVisitorKey(api);
  const second = getOrCreateVisitorKey(api);

  assert.equal(first, second);
  assert.match(first, /^visitor_/);
});

test('getViewWindowStart rounds down to the start of the hour', () => {
  assert.equal(
    getViewWindowStart(new Date('2026-07-02T10:41:22Z')),
    '2026-07-02T10:00:00.000Z',
  );
});

test('safeStorageSet returns false instead of throwing on quota errors', () => {
  const storage = {
    setItem() {
      throw new Error('quota exceeded');
    },
  };

  assert.equal(safeStorageSet(storage, 'k', 'v'), false);
});

test('formatRelativeTime renders ISO timestamps instead of stale literal labels', () => {
  const now = new Date('2026-07-03T10:05:00.000Z');

  assert.equal(formatRelativeTime('2026-07-03T10:05:00.000Z', now), '刚刚');
  assert.equal(formatRelativeTime('2026-07-03T10:00:00.000Z', now), '5 分钟前');
  assert.equal(formatRelativeTime('2026-07-03T08:00:00.000Z', now), '2 小时前');
  assert.equal(formatRelativeTime('刚刚', now), '');
});

test('normalizePostRecord keeps raw editable content and refuses legacy just-now labels', () => {
  const post = normalizePostRecord({
    id: 7,
    title: '安全测试',
    topic: '#测试',
    content: '<b>hello</b>\nworld',
    time_str: '刚刚',
  });

  assert.equal(post.time, '时间未知');
  assert.equal(post.contentText, '<b>hello</b>\nworld');
  assert.equal(post.fullContent, '<p>&lt;b&gt;hello&lt;/b&gt;</p><p>world</p>');
});

test('htmlToPlainText reverses escaped paragraph HTML for editing', () => {
  assert.equal(
    htmlToPlainText('<p>&lt;b&gt;hello&lt;/b&gt;</p><p>world</p>'),
    '<b>hello</b>\nworld',
  );
});
