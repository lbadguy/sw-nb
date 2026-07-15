/**
 * Real Dongchedi profile archive.
 * The browser only consumes the normalized, daily-cached Worker endpoint.
 */

const Shared = window.SwnbShared || {};
const escapeHtml = Shared.escapeHtml || function (value) { return String(value || ''); };
const formatRelativeTime = Shared.formatRelativeTime || function (value) { return String(value || ''); };
const safeStorageGet = Shared.safeStorageGet || function () { return null; };
const safeStorageSet = Shared.safeStorageSet || function () { return false; };

const SNAPSHOT_CACHE_KEY = 'swnb_dongchedi_snapshot_v1';
const THEME_STORAGE_KEY = 'swnb_theme';
const PAGE_SIZE = 12;

const state = {
  snapshot: null,
  query: '',
  visibleCount: PAGE_SIZE,
  activePostId: '',
};

function safeUrl(value, allowedHosts) {
  if (!value) return '';
  try {
    const parsed = new URL(String(value), window.location.origin);
    if (parsed.protocol !== 'https:' && parsed.origin !== window.location.origin) return '';
    if (parsed.origin === window.location.origin) return parsed.href;
    const host = parsed.hostname.toLowerCase();
    const allowed = allowedHosts.some(function (suffix) {
      return host === suffix || host.endsWith('.' + suffix);
    });
    return allowed ? parsed.href : '';
  } catch {
    return '';
  }
}

function safeMediaUrl(value) {
  return safeUrl(value, ['byteimg.com', 'dcarimg.com', 'byteacctimg.com']);
}

function safeSourceUrl(value) {
  return safeUrl(value, ['dongchedi.com', 'dcdapp.com']);
}

function formatCount(value) {
  const number = Number(value) || 0;
  return new Intl.NumberFormat('zh-CN', {
    notation: number >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(number);
}

function formatDate(value, includeTime) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return date.toLocaleString('zh-CN', includeTime ? {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  } : {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function getStoredTheme() {
  const stored = safeStorageGet(window.localStorage, THEME_STORAGE_KEY, '');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateThemeButton(theme) {
  const button = document.getElementById('themeToggleBtn');
  if (!button) return;
  const isDark = theme === 'dark';
  button.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  button.setAttribute('title', isDark ? '切换到浅色模式' : '切换到深色模式');
  const symbol = button.querySelector('.theme-symbol');
  const label = button.querySelector('.theme-label');
  if (symbol) symbol.textContent = isDark ? '◑' : '◐';
  if (label) label.textContent = isDark ? '浅色' : '深色';
}

function applyTheme(theme) {
  const resolved = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = resolved;
  const themeMeta = document.getElementById('themeColorMeta');
  if (themeMeta) themeMeta.setAttribute('content', resolved === 'dark' ? '#0d1014' : '#e9ebee');
  updateThemeButton(resolved);
}

function initTheme() {
  applyTheme(getStoredTheme());
  const button = document.getElementById('themeToggleBtn');
  if (!button) return;
  button.addEventListener('click', function () {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    safeStorageSet(window.localStorage, THEME_STORAGE_KEY, next);
  });
}

function setupMotionReveals() {
  const elements = Array.from(document.querySelectorAll('.motion-reveal'));
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    elements.forEach(function (element) { element.classList.add('is-visible'); });
    return;
  }

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.14 });

  elements.forEach(function (element) { observer.observe(element); });
}

function setImage(element, value) {
  if (!element) return;
  const url = safeMediaUrl(value);
  if (!url) {
    element.removeAttribute('src');
    return;
  }
  element.addEventListener('load', function handleLoad() {
    element.classList.add('is-loaded');
  }, { once: true });
  element.src = url;
}

function updateProfile(snapshot, cacheState) {
  const profile = snapshot.profile || {};
  setText('profileName', profile.name || '我要娶一个旅行车');
  setText('profileBio', profile.bio || '此账号未填写简介。');
  setText('followersCount', formatCount(profile.followers));
  setText('followingCount', formatCount(profile.following));
  setText('likesCount', formatCount(profile.likes));
  setText('postCount', formatCount(snapshot.posts.length));

  const avatar = document.getElementById('profileAvatar');
  if (avatar) avatar.alt = (profile.name || '我要娶一个旅行车') + '的头像';
  setImage(avatar, profile.avatarUrl);
  const heroPost = snapshot.posts.find(function (post) {
    return post && Array.isArray(post.images) && post.images.length > 0;
  });
  const heroImage = heroPost && heroPost.images[0];
  const heroCoverUrl = heroImage && (heroImage.url || heroImage) || profile.coverUrl;
  const heroCover = document.getElementById('profileCover');
  if (heroCover && heroPost) heroCover.alt = '最新动态配图：' + String(heroPost.title || profile.name || '动态配图');
  setImage(heroCover, heroCoverUrl);

  const medals = document.getElementById('profileMedals');
  if (medals) {
    medals.innerHTML = (Array.isArray(profile.medals) ? profile.medals : []).map(function (medal) {
      return '<span class="profile-medal">' + escapeHtml(medal) + '</span>';
    }).join('');
  }

  const sourceUrl = safeSourceUrl(snapshot.sourceUrl);
  const topLink = document.getElementById('topSourceLink');
  if (topLink && sourceUrl) topLink.href = sourceUrl;

  const syncStatus = document.getElementById('syncStatus');
  if (syncStatus) {
    let label = '真实数据，每日同步';
    let status = 'fresh';
    if (cacheState === 'stale') {
      label = '同步稍有延迟，后台正在更新';
      status = 'stale';
    } else if (cacheState === 'local') {
      label = '网络不可用，显示上次同步';
      status = 'error';
    } else if (cacheState === 'refreshed') {
      label = '刚刚完成真实数据同步';
    }
    syncStatus.textContent = label;
    syncStatus.dataset.state = status;
  }
  setText('syncTime', '更新于 ' + formatDate(snapshot.refreshedAt, true));

  const summary = document.getElementById('archiveSummary');
  if (summary) {
    summary.textContent = '已同步 ' + snapshot.posts.length + ' 条公开动态，点击任意内容查看完整图文。';
  }
}

function postSearchText(post) {
  return [post.title, post.content, post.topic, post.activity].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN');
}

function getFilteredPosts() {
  const posts = state.snapshot && Array.isArray(state.snapshot.posts) ? state.snapshot.posts : [];
  if (!state.query) return posts;
  return posts.filter(function (post) { return postSearchText(post).includes(state.query); });
}

function mediaMarkup(post) {
  const images = (Array.isArray(post.images) ? post.images : [])
    .map(function (image) {
      return {
        url: safeMediaUrl(image && image.url),
        alt: String(image && image.alt || post.title || '动态配图'),
      };
    })
    .filter(function (image) { return image.url; })
    .slice(0, 4);

  if (images.length === 0) return '';

  return '<div class="feed-media" data-count="' + images.length + '">' + images.map(function (image) {
    return '<img src="' + escapeHtml(image.url) + '" alt="' + escapeHtml(image.alt) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
  }).join('') + '</div>';
}

function feedCardClass(index, post) {
  const classes = ['feed-card'];
  const cycle = index % 6;
  if (cycle === 0) classes.push('feed-card--wide');
  if (cycle >= 3) classes.push('feed-card--compact');
  if (!post.images || post.images.length === 0) classes.push('feed-card--text');
  return classes.join(' ');
}

function metricMarkup(metrics) {
  const data = metrics || {};
  return [
    '<span>阅读 ' + formatCount(data.reads) + '</span>',
    '<span>赞 ' + formatCount(data.likes) + '</span>',
    '<span>评论 ' + formatCount(data.comments) + '</span>',
  ].join('');
}

function renderFeed() {
  const container = document.getElementById('feedList');
  const status = document.getElementById('feedStatus');
  const loadMoreWrap = document.getElementById('loadMoreWrap');
  if (!container || !status || !loadMoreWrap) return;

  const filtered = getFilteredPosts();
  const visible = filtered.slice(0, state.visibleCount);
  status.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = '';
    status.innerHTML = '<div class="feed-message"><strong>没有匹配的动态</strong><span>换一个关键词试试。</span></div>';
    loadMoreWrap.hidden = true;
    return;
  }

  const fragment = document.createDocumentFragment();
  visible.forEach(function (post, index) {
    const card = document.createElement('article');
    card.className = feedCardClass(index, post);
    card.style.setProperty('--feed-index', String(index));
    card.dataset.postId = String(post.id);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', '查看动态：' + String(post.title || '未命名动态'));

    const topic = post.topic || post.activity || '';
    const relative = formatRelativeTime(post.publishedAt) || formatDate(post.publishedAt, false);
    const copy = post.content && post.content !== post.title ? post.content : '';
    card.innerHTML =
      mediaMarkup(post) +
      '<div class="feed-body">' +
        '<div class="feed-meta">' +
          (topic ? '<span class="feed-topic">' + escapeHtml(topic) + '</span>' : '') +
          '<time datetime="' + escapeHtml(post.publishedAt || '') + '">' + escapeHtml(relative) + '</time>' +
        '</div>' +
        '<h3>' + escapeHtml(post.title || '未命名动态') + '</h3>' +
        (copy ? '<p class="feed-copy">' + escapeHtml(copy) + '</p>' : '<div class="feed-copy"></div>') +
        '<footer class="feed-footer">' +
          '<div class="feed-metrics">' + metricMarkup(post.metrics) + '</div>' +
          '<span class="feed-open">查看全文</span>' +
        '</footer>' +
      '</div>';

    card.addEventListener('click', function () { openArticleModal(post.id); });
    card.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openArticleModal(post.id);
    });
    fragment.appendChild(card);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
  loadMoreWrap.hidden = visible.length >= filtered.length;
}

function renderSnapshot(snapshot, cacheState) {
  if (!snapshot || !snapshot.profile || !Array.isArray(snapshot.posts)) return false;
  state.snapshot = snapshot;
  updateProfile(snapshot, cacheState);
  renderFeed();
  return true;
}

function readLocalSnapshot() {
  const raw = safeStorageGet(window.localStorage, SNAPSHOT_CACHE_KEY, '');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.profile && Array.isArray(parsed.posts) ? parsed : null;
  } catch {
    return null;
  }
}

function saveLocalSnapshot(snapshot) {
  safeStorageSet(window.localStorage, SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
}

function renderFatalError(message, sourceUrl) {
  const status = document.getElementById('feedStatus');
  const container = document.getElementById('feedList');
  if (container) container.innerHTML = '';
  if (!status) return;
  const safeSource = safeSourceUrl(sourceUrl) || 'https://www.dongchedi.com/user/485359118462679';
  status.innerHTML =
    '<div class="feed-message">' +
      '<strong>暂时没有拿到真实动态</strong>' +
      '<span>' + escapeHtml(message || '数据源暂时不可用，请稍后重试。') + '</span> ' +
      '<a href="' + escapeHtml(safeSource) + '" target="_blank" rel="noopener noreferrer">前往懂车帝原页</a>' +
    '</div>';
}

async function loadSnapshot() {
  const local = readLocalSnapshot();
  if (local) renderSnapshot(local, 'local');

  try {
    const response = await fetch('/api/dongchedi-profile', {
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json().catch(function () { return null; });
    if (!response.ok || !payload || !payload.profile || !Array.isArray(payload.posts)) {
      throw new Error(payload && payload.error || '真实数据接口暂时不可用。');
    }
    saveLocalSnapshot(payload);
    renderSnapshot(payload, payload.cache && payload.cache.status || 'fresh');
  } catch (error) {
    if (local) {
      const syncStatus = document.getElementById('syncStatus');
      if (syncStatus) {
        syncStatus.textContent = '网络不可用，显示上次同步';
        syncStatus.dataset.state = 'error';
      }
      return;
    }
    renderFatalError(error instanceof Error ? error.message : '数据源暂时不可用。');
  }
}

function openArticleModal(postId) {
  const posts = state.snapshot && Array.isArray(state.snapshot.posts) ? state.snapshot.posts : [];
  const post = posts.find(function (item) { return String(item.id) === String(postId); });
  const dialog = document.getElementById('articleModal');
  const body = document.getElementById('modalBodyContent');
  if (!post || !dialog || !body) return;

  state.activePostId = String(post.id);
  setText('dialogTitle', post.title || '动态详情');
  setText('dialogDate', formatDate(post.publishedAt, true));

  const gallery = (Array.isArray(post.images) ? post.images : []).map(function (image) {
    const url = safeMediaUrl(image && image.url);
    if (!url) return '';
    return '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(image.alt || post.title || '动态配图') + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
  }).filter(Boolean).join('');
  const sourceUrl = safeSourceUrl(post.sourceUrl);
  const topic = post.topic || post.activity || '';

  body.innerHTML =
    (topic ? '<div class="feed-meta"><span class="feed-topic">' + escapeHtml(topic) + '</span></div>' : '') +
    '<div class="dialog-copy">' + escapeHtml(post.content || post.title || '') + '</div>' +
    (gallery ? '<div class="dialog-gallery">' + gallery + '</div>' : '') +
    '<div class="dialog-actions">' +
      '<div class="dialog-metrics">' + metricMarkup(post.metrics) + '</div>' +
      (sourceUrl ? '<a class="button-primary" href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer">查看原帖</a>' : '') +
    '</div>';

  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function initDialog() {
  const dialog = document.getElementById('articleModal');
  if (!dialog) return;
  dialog.addEventListener('close', function () { state.activePostId = ''; });
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) dialog.close();
  });
}

function initSearch() {
  const input = document.getElementById('postSearch');
  const clearButton = document.getElementById('clearSearchBtn');
  const loadMoreButton = document.getElementById('loadMoreBtn');
  if (input) {
    input.addEventListener('input', function () {
      state.query = input.value.trim().toLocaleLowerCase('zh-CN');
      state.visibleCount = PAGE_SIZE;
      if (clearButton) clearButton.hidden = !state.query;
      renderFeed();
    });
  }
  if (clearButton) {
    clearButton.addEventListener('click', function () {
      if (!input) return;
      input.value = '';
      state.query = '';
      state.visibleCount = PAGE_SIZE;
      clearButton.hidden = true;
      renderFeed();
      input.focus();
    });
  }
  if (loadMoreButton) {
    loadMoreButton.addEventListener('click', function () {
      state.visibleCount += PAGE_SIZE;
      renderFeed();
    });
  }
}

document.addEventListener('DOMContentLoaded', function () {
  initTheme();
  setupMotionReveals();
  initDialog();
  initSearch();
  loadSnapshot();
});
