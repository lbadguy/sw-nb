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
    return {
      id: item.id,
      title: item.title || '无标题文章',
      topic: item.topic || '#日常分享',
      snippet: item.snippet || (item.content ? item.content.substring(0, 95) + '...' : ''),
      time: item.time_str || '刚刚',
      views: item.likes || 0,
      images: parseImages(item.images),
      fullContent: item.content
        ? '<p>' + escapeHtml(item.content).replace(/\n/g, '</p><p>') + '</p>'
        : '',
    };
  }

  return {
    escapeHtml,
    getOrCreateVisitorKey,
    getViewWindowStart,
    normalizePostRecord,
    parseImages,
    safeStorageGet,
    safeStorageSet,
    safeStorageRemove,
  };
});
