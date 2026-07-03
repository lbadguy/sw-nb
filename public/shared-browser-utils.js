(function (root, factory) {
  const api = factory();

  root.SwnbShared = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function escapeHtml(str) {
    if (!str) return '';

    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };

    return String(str).replace(/[&<>"']/g, (char) => map[char]);
  }

  function unescapeHtml(str) {
    if (!str) return '';

    const map = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#039;': "'",
      '&#39;': "'",
    };

    return String(str).replace(/&(amp|lt|gt|quot|#039|#39);/g, (entity) => map[entity] || entity);
  }

  function htmlToPlainText(html) {
    if (!html) return '';

    return unescapeHtml(
      String(html)
        .replace(/<\/p>\s*<p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?p>/gi, '')
        .replace(/<[^>]*>/g, ''),
    ).trim();
  }

  function parseDate(input) {
    if (!input) return null;
    const date = input instanceof Date ? input : new Date(input);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatRelativeTime(input, now = new Date()) {
    const date = parseDate(input);
    const current = parseDate(now);
    if (!date || !current) return '';

    const diffMs = Math.max(0, current.getTime() - date.getTime());
    const diffSeconds = Math.floor(diffMs / 1000);
    if (diffSeconds < 60) return '刚刚';

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return diffMinutes + ' 分钟前';

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return diffHours + ' 小时前';

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return diffDays + ' 天前';

    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  function getPostTimestamp(item) {
    const source = item && (
      item.created_at ||
      item.createdAt ||
      item.published_at ||
      item.timeSource ||
      item.time_str
    );
    const date = parseDate(source);
    return date ? date.toISOString() : '';
  }

  function getOrCreateVisitorKey(storage, keyName = 'swnb_visitor_key') {
    try {
      const existing = storage && storage.getItem ? storage.getItem(keyName) : null;
      if (existing) return existing;

      const created = 'visitor_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      if (storage && storage.setItem) storage.setItem(keyName, created);
      return created;
    } catch {
      return 'visitor_ephemeral';
    }
  }

  function getViewWindowStart(input) {
    const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
    date.setUTCMinutes(0, 0, 0);
    return date.toISOString();
  }

  function safeStorageSet(storage, key, value) {
    try {
      if (storage && storage.setItem) storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function safeStorageGet(storage, key, fallback = null) {
    try {
      if (storage && storage.getItem) {
        const value = storage.getItem(key);
        return value === null ? fallback : value;
      }
    } catch {
      return fallback;
    }

    return fallback;
  }

  function safeStorageRemove(storage, key) {
    try {
      if (storage && storage.removeItem) storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function parseImages(images) {
    if (!images) return [];

    try {
      const parsed = typeof images === 'string' ? JSON.parse(images) : images;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function normalizePostRecord(item) {
    const contentText = typeof item.contentText === 'string'
      ? item.contentText
      : (typeof item.content === 'string' ? item.content : htmlToPlainText(item.fullContent || ''));
    const timeSource = getPostTimestamp(item);

    return {
      id: item.id,
      title: item.title || '无标题文章',
      topic: item.topic || '#日常分享',
      snippet: item.snippet || (contentText ? contentText.substring(0, 95) + '...' : ''),
      time: timeSource ? formatRelativeTime(timeSource) : '时间未知',
      timeSource,
      contentText,
      views: typeof item.likes === 'number' ? item.likes : (item.views || 0),
      images: parseImages(item.images),
      fullContent: contentText
        ? '<p>' + escapeHtml(contentText).replace(/\n/g, '</p><p>') + '</p>'
        : '',
    };
  }

  return {
    escapeHtml,
    formatRelativeTime,
    getOrCreateVisitorKey,
    getViewWindowStart,
    htmlToPlainText,
    normalizePostRecord,
    parseImages,
    safeStorageGet,
    safeStorageSet,
    safeStorageRemove,
  };
});
