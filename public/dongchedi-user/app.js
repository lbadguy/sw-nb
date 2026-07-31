const Shared = window.SwnbShared || {};
const escapeHtml = Shared.escapeHtml || ((value) => String(value || ''));
const formatRelativeTime = Shared.formatRelativeTime || ((value) => String(value || ''));
const safeStorageGet = Shared.safeStorageGet || (() => null);
const safeStorageSet = Shared.safeStorageSet || (() => false);

const SNAPSHOT_CACHE_KEY = 'swnb_dongchedi_snapshot_v1';
const PAGE_SIZE = 12;

const state = {
  snapshot: null,
  query: '',
  sort: 'latest',
  visibleCount: PAGE_SIZE,
};

function icons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
}

function safeUrl(value, allowedHosts) {
  if (!value) return '';
  try {
    const parsed = new URL(String(value), window.location.origin);
    if (parsed.origin === window.location.origin) return parsed.href;
    if (parsed.protocol !== 'https:') return '';
    const hostname = parsed.hostname.toLowerCase();
    return allowedHosts.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
      ? parsed.href
      : '';
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

function formatDate(value, includeTime = false) {
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

function setRemoteImage(element, value) {
  if (!element) return;
  const url = safeMediaUrl(value);
  if (!url) return;
  element.src = url;
  element.referrerPolicy = 'no-referrer';
  element.decoding = 'async';
}

function setSyncState(status, label) {
  const readout = document.querySelector('.sync-readout');
  const beacon = document.getElementById('headerSyncState');
  const syncStatus = document.getElementById('syncStatus');
  if (readout) readout.dataset.state = status;
  if (beacon) {
    beacon.dataset.state = status;
    beacon.innerHTML = `<span></span>${escapeHtml(status === 'error' ? 'CACHE OFFLINE' : status === 'stale' ? 'STALE / REFRESHING' : 'DAILY SNAPSHOT')}`;
  }
  if (syncStatus) {
    const icon = status === 'error' ? 'cloud-off' : status === 'stale' ? 'refresh-cw' : 'radio-tower';
    syncStatus.innerHTML = `<i data-lucide="${icon}"></i>${escapeHtml(label)}`;
  }
  icons();
}

function updateProfile(snapshot, cacheState) {
  const profile = snapshot.profile || {};
  setText('profileName', '');
  const heading = document.getElementById('profileName');
  if (heading) {
    const name = profile.name || '我要娶一个旅行车';
    const splitAt = name.includes('旅行车') ? name.indexOf('旅行车') : Math.max(1, Math.floor(name.length * 0.62));
    const first = name.slice(0, splitAt);
    const second = name.slice(splitAt);
    heading.innerHTML = `<span>${escapeHtml(first)}</span><span class="outline-word">${escapeHtml(second)}</span>`;
  }

  setText('profileBio', profile.bio || '记录旅行车、道路与真实驾驶现场。');
  setText('followersCount', formatCount(profile.followers));
  setText('followingCount', formatCount(profile.following));
  setText('likesCount', formatCount(profile.likes));
  setText('postCount', formatCount(snapshot.posts.length));
  setRemoteImage(document.getElementById('profileAvatar'), profile.avatarUrl);

  const heroPost = snapshot.posts.find((post) => Array.isArray(post.images) && post.images.length > 0);
  const heroImage = heroPost && heroPost.images[0];
  setRemoteImage(document.getElementById('profileCover'), (heroImage && (heroImage.url || heroImage)) || profile.coverUrl);

  const medals = document.getElementById('profileMedals');
  if (medals) {
    medals.innerHTML = (Array.isArray(profile.medals) ? profile.medals : [])
      .map((medal) => `<span>${escapeHtml(medal)}</span>`)
      .join('');
  }

  const sourceUrl = safeSourceUrl(snapshot.sourceUrl);
  ['topSourceLink', 'bottomSourceLink'].forEach((id) => {
    const link = document.getElementById(id);
    if (link && sourceUrl) link.href = sourceUrl;
  });

  setText('syncTime', `更新于 ${formatDate(snapshot.refreshedAt, true)}`);
  setText('archiveSummary', `已归档 ${snapshot.posts.length} 条公开动态，每日同步并保留最近成功快照。`);
  if (cacheState === 'stale') setSyncState('stale', '快照稍有延迟，后台正在更新');
  else if (cacheState === 'local') setSyncState('stale', '网络不可用，显示本机最近快照');
  else if (cacheState === 'refreshed') setSyncState('fresh', '刚刚完成数据同步');
  else setSyncState('fresh', '真实数据 / 每日快照');
}

function postSearchText(post) {
  return [post.title, post.content, post.topic, post.activity].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN');
}

function popularity(post) {
  const metrics = post.metrics || {};
  return (Number(metrics.reads) || 0)
    + (Number(metrics.likes) || 0) * 300
    + (Number(metrics.comments) || 0) * 120
    + (Number(metrics.shares) || 0) * 180;
}

function getFilteredPosts() {
  const posts = state.snapshot && Array.isArray(state.snapshot.posts) ? [...state.snapshot.posts] : [];
  const filtered = state.query
    ? posts.filter((post) => postSearchText(post).includes(state.query))
    : posts;
  if (state.sort === 'popular') filtered.sort((left, right) => popularity(right) - popularity(left));
  else filtered.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
  return filtered;
}

function postImage(post) {
  const images = Array.isArray(post.images) ? post.images : [];
  for (const image of images) {
    const url = safeMediaUrl(image && (image.url || image));
    if (url) return { url, count: images.length };
  }
  const coverUrl = safeMediaUrl(post.video && post.video.coverUrl);
  return coverUrl ? { url: coverUrl, count: 1 } : null;
}

function metricMarkup(metrics) {
  const data = metrics || {};
  return [
    `<span><i data-lucide="eye"></i>${formatCount(data.reads)}</span>`,
    `<span><i data-lucide="heart"></i>${formatCount(data.likes)}</span>`,
    `<span><i data-lucide="message-circle"></i>${formatCount(data.comments)}</span>`,
  ].join('');
}

function buildFeedCard(post, index) {
  const card = document.createElement('article');
  card.className = `feed-card${index === 0 ? ' feed-card--lead' : ''}`;
  card.style.setProperty('--feed-index', String(index));
  card.dataset.postId = String(post.id);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `查看动态：${String(post.title || '未命名动态')}`);

  const image = postImage(post);
  const topic = post.topic || post.activity || '公开动态';
  const relative = formatRelativeTime(post.publishedAt) || formatDate(post.publishedAt);
  const copy = post.content && post.content !== post.title ? post.content : '';
  card.innerHTML = `
    ${image ? `<div class="feed-media"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(post.title || '动态配图')}" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="feed-image-count"><i data-lucide="images"></i>${image.count}</span>${post.video ? '<span class="feed-video"><i data-lucide="play"></i>VIDEO</span>' : ''}</div>` : ''}
    <div class="feed-body">
      <div class="feed-meta"><span class="feed-topic">${escapeHtml(topic)}</span><time datetime="${escapeHtml(post.publishedAt || '')}">${escapeHtml(relative)}</time></div>
      <h3>${escapeHtml(post.title || '未命名动态')}</h3>
      <p class="feed-copy">${escapeHtml(copy || '打开查看这条公开动态的完整内容。')}</p>
      <footer class="feed-footer"><div class="feed-metrics">${metricMarkup(post.metrics)}</div><span class="feed-open">全文 <i data-lucide="arrow-up-right"></i></span></footer>
    </div>`;
  return card;
}

function renderFeed() {
  const container = document.getElementById('feedList');
  const status = document.getElementById('feedStatus');
  const loadMoreWrap = document.getElementById('loadMoreWrap');
  if (!container || !status || !loadMoreWrap) return;

  const filtered = getFilteredPosts();
  const visible = filtered.slice(0, state.visibleCount);
  status.innerHTML = '';
  container.innerHTML = '';

  if (filtered.length === 0) {
    status.innerHTML = '<div class="feed-message"><div><strong>没有匹配的动态</strong><p>换一个关键词，或者切回最新排序。</p></div></div>';
    loadMoreWrap.hidden = true;
    return;
  }

  const fragment = document.createDocumentFragment();
  visible.forEach((post, index) => fragment.appendChild(buildFeedCard(post, index)));
  container.appendChild(fragment);
  loadMoreWrap.hidden = visible.length >= filtered.length;
  icons();
}

function validSnapshot(snapshot) {
  return Boolean(snapshot && snapshot.profile && Array.isArray(snapshot.posts) && snapshot.refreshedAt);
}

function renderSnapshot(snapshot, cacheState) {
  if (!validSnapshot(snapshot)) return false;
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
    return validSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function renderFatalError(message, sourceUrl) {
  const status = document.getElementById('feedStatus');
  const container = document.getElementById('feedList');
  if (container) container.innerHTML = '';
  const source = safeSourceUrl(sourceUrl) || 'https://www.dongchedi.com/user/485359118462679';
  if (status) {
    status.innerHTML = `<div class="feed-message"><div><strong>暂时没有拿到公开动态</strong><p>${escapeHtml(message || '数据源暂时不可用，请稍后重试。')}</p></div><a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">前往源主页</a></div>`;
  }
  setSyncState('error', '快照暂时不可用');
}

async function loadSnapshot() {
  const local = readLocalSnapshot();
  if (local) renderSnapshot(local, 'local');

  try {
    const response = await fetch('/api/dongchedi-profile', { headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !validSnapshot(payload)) {
      throw new Error((payload && payload.error) || '真实数据接口暂时不可用。');
    }
    safeStorageSet(window.localStorage, SNAPSHOT_CACHE_KEY, JSON.stringify(payload));
    renderSnapshot(payload, (payload.cache && payload.cache.status) || 'fresh');
  } catch (error) {
    if (local) {
      setSyncState('stale', '网络不可用，显示本机最近快照');
      return;
    }
    renderFatalError(error instanceof Error ? error.message : '数据源暂时不可用。');
  }
}

function openArticleModal(postId) {
  const posts = state.snapshot && Array.isArray(state.snapshot.posts) ? state.snapshot.posts : [];
  const post = posts.find((item) => String(item.id) === String(postId));
  const dialog = document.getElementById('articleModal');
  const body = document.getElementById('modalBodyContent');
  if (!post || !dialog || !body) return;

  setText('dialogTitle', post.title || '动态详情');
  setText('dialogDate', formatDate(post.publishedAt, true));
  const gallery = (Array.isArray(post.images) ? post.images : []).map((image) => {
    const url = safeMediaUrl(image && (image.url || image));
    return url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml((image && image.alt) || post.title || '动态配图')}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';
  }).filter(Boolean).join('');
  const sourceUrl = safeSourceUrl(post.sourceUrl);
  const topic = post.topic || post.activity || '公开动态';

  body.innerHTML = `
    <div class="dialog-topic">${escapeHtml(topic)}</div>
    <div class="dialog-copy">${escapeHtml(post.content || post.title || '')}</div>
    ${gallery ? `<div class="dialog-gallery">${gallery}</div>` : ''}
    <div class="dialog-actions"><div class="feed-metrics">${metricMarkup(post.metrics)}</div>${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">查看原帖 <i data-lucide="external-link"></i></a>` : ''}</div>`;
  icons();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function bindFeedEvents() {
  const feed = document.getElementById('feedList');
  feed.addEventListener('click', (event) => {
    const card = event.target.closest('[data-post-id]');
    if (card) openArticleModal(card.dataset.postId);
  });
  feed.addEventListener('keydown', (event) => {
    const card = event.target.closest('[data-post-id]');
    if (!card || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    openArticleModal(card.dataset.postId);
  });
}

function bindControls() {
  const input = document.getElementById('postSearch');
  const clearButton = document.getElementById('clearSearchBtn');
  input.addEventListener('input', () => {
    state.query = input.value.trim().toLocaleLowerCase('zh-CN');
    state.visibleCount = PAGE_SIZE;
    clearButton.hidden = !state.query;
    renderFeed();
  });
  clearButton.addEventListener('click', () => {
    input.value = '';
    state.query = '';
    state.visibleCount = PAGE_SIZE;
    clearButton.hidden = true;
    renderFeed();
    input.focus();
  });
  document.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => {
    state.sort = button.dataset.sort;
    state.visibleCount = PAGE_SIZE;
    document.querySelectorAll('[data-sort]').forEach((item) => item.classList.toggle('is-active', item === button));
    renderFeed();
  }));
  document.getElementById('loadMoreBtn').addEventListener('click', () => {
    state.visibleCount += PAGE_SIZE;
    renderFeed();
  });
}

function initMotion() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const media = document.querySelector('[data-profile-parallax]');
  if (!reduced && media) {
    window.addEventListener('scroll', () => {
      if (window.scrollY <= window.innerHeight) media.style.transform = `scale(1.035) translate3d(0, ${window.scrollY * 0.08}px, 0)`;
    }, { passive: true });
  }

  const reveals = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach((element) => element.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.14 });
  reveals.forEach((element) => observer.observe(element));
}

function initDialog() {
  const dialog = document.getElementById('articleModal');
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

function init() {
  icons();
  bindControls();
  bindFeedEvents();
  initDialog();
  initMotion();
  loadSnapshot();
}

init();
