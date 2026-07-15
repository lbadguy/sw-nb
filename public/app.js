/**
 * SW-nb Premium Geek Portal & Real-time Blog Logic
 * Features: Supabase Cloud DB, Custom Toast Notifications, Article Views Counter,
 *           Multi-Image Upload & Clipboard Paste Support, Detailed Visitor Tracking & Stay Analytics
 *
 * Security: shared escaping helpers, server-side admin verification, URL sanitization
 * Performance: Debounced localStorage writes, DocumentFragment rendering, throttled stay tracking
 */

// ==========================================
// 0. UTILITY & SECURITY HELPERS
// ==========================================

const Shared = window.SwnbShared || {};
const escapeHtml = Shared.escapeHtml || function (str) { return String(str || ''); };
const formatRelativeTime = Shared.formatRelativeTime || function (input) { return String(input || '时间未知'); };
const getOrCreateVisitorKey = Shared.getOrCreateVisitorKey || function () { return 'visitor_ephemeral'; };
const htmlToPlainText = Shared.htmlToPlainText || function (html) { return String(html || ''); };
const normalizePostRecord = Shared.normalizePostRecord || function (item) { return item; };
const safeStorageGet = Shared.safeStorageGet || function () { return null; };
const safeStorageSet = Shared.safeStorageSet || function () { return false; };
const safeStorageRemove = Shared.safeStorageRemove || function () { return false; };
const THEME_STORAGE_KEY = 'swnb_theme';

function escapeAttribute(str) {
  return escapeHtml(str);
}

/** 图片 URL 安全校验 - 仅允许 http/https 和本地生成的 base64 图片 */
function sanitizeImageUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) {
    return trimmed.replace(/\s/g, '');
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
    return '';
  } catch {
    return '';
  }
}

/** 防抖函数 - 延迟执行，合并高频调用 */
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/** Canvas 图片压缩 - 生成预览缩略图，保留原图用于下载 */
function compressImage(base64, maxWidth = 1200, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}

/** 获取图片展示用缩略图 URL (兼容旧格式字符串和新格式对象) */
function getImageThumb(img) {
  if (typeof img === 'string') return sanitizeImageUrl(img);
  return sanitizeImageUrl(img && (img.thumb || img.original) || '');
}

/** 获取图片下载用原始高清 URL */
function getImageOriginal(img) {
  if (typeof img === 'string') return sanitizeImageUrl(img);
  return sanitizeImageUrl(img && (img.original || img.thumb) || '');
}

const modalFocusOrigins = new Map();

function modalFocusables(modal) {
  return Array.from(modal.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(function (element) {
    return !element.hasAttribute('hidden') && element.getClientRects().length > 0;
  });
}

function closeModalFromKeyboard(modalId) {
  if (modalId === 'adminAuthModal') return closeAdminAuthModal();
  if (modalId === 'publishModal') return closePublishModal();
  if (modalId === 'editArticleModal') return closeEditArticleModal();
  if (modalId === 'articleModal') return closeArticleModal();
  if (modalId === 'visitorDetailModal') return closeVisitorDetailModal();
  toggleModal(modalId, false);
}

/** 通用 Modal 切换，包含 inert、焦点归还和键盘约束。 */
function toggleModal(modalId, show) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  if (show) {
    const current = document.querySelector('.modal-overlay.active');
    if (current && current !== modal) toggleModal(current.id, false);

    if (document.activeElement instanceof HTMLElement) {
      modalFocusOrigins.set(modalId, document.activeElement);
    }
    modal.inert = false;
    modal.removeAttribute('inert');
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('active');
    document.body.classList.add('modal-open');

    window.requestAnimationFrame(function () {
      const initial = modal.querySelector(
        'input:not([disabled]):not([type="hidden"]):not([type="file"]), textarea:not([disabled]), select:not([disabled])'
      ) || modal.querySelector('button:not([disabled]), a[href]');
      (initial || modal).focus({ preventScroll: true });
    });
    return;
  }

  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  modal.inert = true;
  modal.setAttribute('inert', '');
  document.body.classList.toggle('modal-open', Boolean(document.querySelector('.modal-overlay.active')));

  const origin = modalFocusOrigins.get(modalId);
  modalFocusOrigins.delete(modalId);
  if (origin && origin.isConnected) {
    window.requestAnimationFrame(function () { origin.focus({ preventScroll: true }); });
  }
}

document.addEventListener('keydown', function (event) {
  const modal = document.querySelector('.modal-overlay.active');
  if (!modal) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeModalFromKeyboard(modal.id);
    return;
  }

  if (event.key !== 'Tab') return;
  const focusables = modalFocusables(modal);
  if (focusables.length === 0) {
    event.preventDefault();
    modal.focus();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
});

function updateThemeToggleButton(theme) {
  var btn = document.getElementById('themeToggleBtn');
  if (!btn) return;

  var isDark = theme === 'dark';
  var nextLabel = isDark ? '浅色' : '深色';
  btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  btn.setAttribute('title', '切换到' + nextLabel + '模式');
  btn.innerHTML = isDark
    ? '<span class="theme-symbol" aria-hidden="true">◑</span><span class="theme-label">浅色</span>'
    : '<span class="theme-symbol" aria-hidden="true">◐</span><span class="theme-label">深色</span>';
}

function applyTheme(theme) {
  var resolvedTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = resolvedTheme;
  var themeMeta = document.getElementById('themeColorMeta');
  if (themeMeta) themeMeta.setAttribute('content', resolvedTheme === 'dark' ? '#0d1014' : '#e9ebee');
  updateThemeToggleButton(resolvedTheme);
}

function getPreferredTheme() {
  var storedTheme = safeStorageGet(window.localStorage, THEME_STORAGE_KEY, '');
  if (storedTheme === 'dark' || storedTheme === 'light') {
    return storedTheme;
  }

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

function toggleTheme() {
  var currentTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  var nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
  safeStorageSet(window.localStorage, THEME_STORAGE_KEY, nextTheme);
}

function initThemeToggle() {
  applyTheme(getPreferredTheme());

  var btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  btn.addEventListener('click', toggleTheme);
}

function setupMotionReveals() {
  var elements = Array.from(document.querySelectorAll('.motion-reveal'));
  if (!('IntersectionObserver' in window) || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    elements.forEach(function (element) { element.classList.add('is-visible'); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.14 });

  elements.forEach(function (element) { observer.observe(element); });
}

function formatCompactCount(value) {
  var number = Number(value) || 0;
  return new Intl.NumberFormat('zh-CN', {
    notation: number >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(number);
}

function setProfileImage(element, value, markLoaded) {
  if (!element) return;
  var safe = sanitizeImageUrl(value);
  if (!safe) return;
  if (markLoaded) {
    element.addEventListener('load', function () { element.classList.add('is-loaded'); }, { once: true });
  }
  element.src = safe;
}

async function loadDongchediHero() {
  var status = document.getElementById('profileHeroStatus');
  try {
    var response = await fetch('/api/dongchedi-profile', {
      headers: { Accept: 'application/json' },
    });
    var snapshot = await response.json();
    if (!response.ok || !snapshot || !snapshot.profile || !Array.isArray(snapshot.posts)) {
      throw new Error('profile unavailable');
    }

    var profile = snapshot.profile;
    var name = profile.name || '我要娶一个旅行车';
    var nameElement = document.getElementById('profileHeroName');
    if (nameElement) nameElement.textContent = name;
    if (status) status.textContent = '真实主页，每日同步';

    var avatar = document.getElementById('profileHeroAvatar');
    if (avatar) avatar.alt = name + '的头像';
    setProfileImage(avatar, profile.avatarUrl, false);
    var heroPost = snapshot.posts.find(function (post) {
      return post && Array.isArray(post.images) && post.images.length > 0;
    });
    var heroImage = heroPost && heroPost.images[0];
    var heroCoverUrl = heroImage && (heroImage.url || heroImage) || profile.coverUrl;
    var heroCover = document.getElementById('profileHeroCover');
    if (heroCover && heroPost) heroCover.alt = '最新动态配图：' + String(heroPost.title || name);
    setProfileImage(heroCover, heroCoverUrl, true);

    var archiveCount = document.getElementById('heroArchiveCount');
    var followerCount = document.getElementById('heroFollowerCount');
    if (archiveCount) archiveCount.textContent = formatCompactCount(snapshot.posts.length);
    if (followerCount) followerCount.textContent = formatCompactCount(profile.followers);
  } catch {
    if (status) status.textContent = '真实主页暂时离线';
  }
}

// ==========================================
// APP STATE NAMESPACE - 收敛全局变量
// ==========================================
const App = {
  supabaseClient: null,
  adminPassword: '',
  isAdminUnlocked: false,
  pendingAdminAction: '',
  currentVisitorIp: '公网 IP 获取失败',
  currentVisitorKey: 'visitor_ephemeral',
  currentVisitorLogId: Date.now(),
  currentArticleId: null,
  editingPostId: null,
  isSubmittingPost: false,
  isSavingPost: false,
  // 默认/回退文章数据
  postsData: [
    {
      id: 1,
      title: '[系统公告] SW-nb 个人全栈门户与云端实时动态发布上线！',
      topic: '#全站公告',
      snippet: '欢迎来到 SW-nb 全新门户！本站已成功接入 Supabase 云端数据库，支持全网实时动态发布、单 IP 每日发帖频控防刷保护，支持批量传图与剪切板直接粘贴图片！',
      time: '时间未知',
      timeSource: '',
      views: 1,
      images: [
        'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&auto=format&fit=crop&q=80'
      ],
      contentText: '欢迎来到 SW-nb 全新门户！本站已成功接入 Supabase 云端数据库，支持全网实时动态发布、单 IP 每日发帖频控防刷保护，支持批量传图与剪切板直接粘贴图片！\n已彻底移除繁杂的点赞与收藏，转为精炼纯粹的点击阅读量统计。点击正文里的每一张照片右上角均可直接下载原图！',
      fullContent: '<p>欢迎来到 SW-nb 全新门户！本站已成功接入 Supabase 云端数据库，支持全网实时动态发布、单 IP 每日发帖频控防刷保护，支持批量传图与剪切板直接粘贴图片！</p><p>已彻底移除繁杂的点赞与收藏，转为精炼纯粹的点击阅读量统计。点击正文里的每一张照片右上角均可直接下载原图！</p>'
    }
  ]
};

// ==========================================
// IMAGE MANAGER - 统一管理发布/编辑的多图状态
// ==========================================
const ImageManager = {
  // 每张图存储为 { thumb: '压缩预览', original: '下载图' }
  uploadImages: [],
  editImages: [],

  /** 添加本地图片 (压缩后再入库，避免 base64 原图拖慢发布和渲染) */
  async add(base64, isEdit) {
    const arr = isEdit ? this.editImages : this.uploadImages;
    if (arr.length >= 9) {
      showToast('最多上传 9 张图片', 'error');
      return false;
    }
    const compressed = await compressImage(base64, 1200, 0.72);
    arr.push({ thumb: compressed, original: compressed });
    return true;
  },

  /** 添加网络 URL 图片 (不压缩，thumb 和 original 相同) */
  addUrl(url, isEdit) {
    const safeUrl = sanitizeImageUrl(url);
    if (!safeUrl) return false;
    const arr = isEdit ? this.editImages : this.uploadImages;
    if (arr.length >= 9) {
      showToast('最多上传 9 张图片', 'error');
      return false;
    }
    arr.push({ thumb: safeUrl, original: safeUrl });
    return true;
  },

  remove(index, isEdit) {
    const arr = isEdit ? this.editImages : this.uploadImages;
    if (index >= 0 && index < arr.length) arr.splice(index, 1);
  },

  clear(isEdit) {
    if (isEdit) this.editImages = [];
    else this.uploadImages = [];
  },

  getAll(isEdit) {
    return isEdit ? this.editImages : this.uploadImages;
  },

  /** 从旧格式数据加载 (兼容纯字符串数组和新 {thumb,original} 格式) */
  loadFromData(images, isEdit) {
    const arr = (images || []).map(img => {
      if (typeof img === 'string') {
        var safe = sanitizeImageUrl(img);
        return safe ? { thumb: safe, original: safe } : null;
      }
      var thumb = getImageThumb(img);
      var original = getImageOriginal(img) || thumb;
      return thumb ? { thumb, original } : null;
    }).filter(Boolean);
    if (isEdit) this.editImages = arr;
    else this.uploadImages = arr;
  },

  serialize(isEdit) {
    return this.getAll(isEdit);
  }
};

// ==========================================
// SUPABASE INITIALIZATION
// ==========================================
const SUPABASE_URL = 'https://szbgotjjhurfxhyktbus.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_swGyzcP9s0tTZwf0vgF5cw_5h5VV2ww';

function initSupabase() {
  if (typeof window.supabase !== 'undefined' && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      App.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('🟢 Supabase 云端同步就绪！');
    } catch (err) {
      console.warn('Supabase 初始化异常:', err);
    }
  }
}

function readJsonStorage(key, fallback) {
  const raw = safeStorageGet(window.localStorage, key, null);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value, failureMessage) {
  const ok = safeStorageSet(window.localStorage, key, JSON.stringify(value));
  if (!ok && failureMessage) {
    showToast(failureMessage, 'error');
  }
  return ok;
}

function persistPostsCache(notifyOnFailure) {
  return writeJsonStorage(
    'swnb_premium_posts',
    App.postsData,
    notifyOnFailure ? '云端已更新，但本地缓存写入失败' : '',
  );
}

function persistVisitorLogs(logs, notifyOnFailure) {
  return writeJsonStorage(
    'swnb_visitor_logs',
    logs,
    notifyOnFailure ? '访客日志更新了，但本地缓存写入失败' : '',
  );
}

function setStoredValue(key, value, failureMessage) {
  const ok = safeStorageSet(window.localStorage, key, String(value));
  if (!ok && failureMessage) {
    showToast(failureMessage, 'error');
  }
  return ok;
}

function removeStoredValue(key, failureMessage) {
  const ok = safeStorageRemove(window.localStorage, key);
  if (!ok && failureMessage) {
    showToast(failureMessage, 'error');
  }
  return ok;
}

async function callBlogApi(path, payload) {
  const response = await fetch(SUPABASE_URL + '/functions/v1/blog-api' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload || {}),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error((json && json.error) || 'Blog API request failed');
  }

  return json ? json.data : null;
}

function setButtonBusy(buttonId, busy, label) {
  var button = document.getElementById(buttonId);
  if (!button) return;

  if (!button.dataset.idleLabel) {
    button.dataset.idleLabel = button.innerHTML;
  }

  button.disabled = !!busy;
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
  button.innerHTML = busy ? escapeHtml(label || '处理中...') : button.dataset.idleLabel;
}

function ensureAdminSession(actionLabel) {
  if (App.isAdminUnlocked && App.adminPassword) return true;

  App.pendingAdminAction = actionLabel || '';
  openAdminAuthModal();
  showToast('此操作需要管理员验证', 'error');
  return false;
}

function mapPostFromRecord(record) {
  const mapped = normalizePostRecord(record);
  if (record && record.likes === 666) mapped.views = 1;
  return mapped;
}

function getPostDisplayTime(post) {
  if (!post) return '时间未知';
  if (post.timeSource) {
    return formatRelativeTime(post.timeSource) || '时间未知';
  }
  return post.time || '时间未知';
}

function replacePostInState(post) {
  const existingIndex = App.postsData.findIndex(function (item) { return item.id === post.id; });
  if (existingIndex >= 0) App.postsData.splice(existingIndex, 1, post);
  else App.postsData.unshift(post);
}

function setAdminUnlockState(pass) {
  App.adminPassword = pass;
  App.isAdminUnlocked = true;
  const adminNav = document.getElementById('navAdminItem');
  if (adminNav) {
    adminNav.hidden = false;
    adminNav.style.removeProperty('display');
  }
}

function clearAdminUnlockState() {
  App.adminPassword = '';
  App.isAdminUnlocked = false;
}

function loadCachedPosts() {
  const localSaved = readJsonStorage('swnb_premium_posts', []);
  if (Array.isArray(localSaved) && localSaved.length > 0) {
    App.postsData = localSaved.map(mapPostFromRecord);
    return true;
  }
  return false;
}

function refreshRelativePostTimes() {
  if (!App.postsData || App.postsData.length === 0) return;
  App.postsData.forEach(function (post) {
    post.time = getPostDisplayTime(post);
  });
  renderPostList();

  var modal = document.getElementById('articleModal');
  if (modal && modal.classList.contains('active') && App.currentArticleId) {
    openArticleModal(App.currentArticleId, { skipSync: true, skipAction: true });
  }
}

// ==========================================
// CUSTOM MODERN TOAST NOTIFICATION ENGINE
// ==========================================
function showToast(message, type = 'success') {
  let container = document.getElementById('customToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'customToastContainer';
    container.className = 'custom-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'custom-toast ' + type;
  const icon = type === 'error' ? '!' : '✓';
  toast.innerHTML =
    '<span aria-hidden="true">' + icon + '</span>' +
    '<span>' + escapeHtml(message) + '</span>';

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastSlideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================
// VISITOR TRACKING & STAY ANALYTICS
// ==========================================

// 防抖写入访客日志到 localStorage
const debouncedSaveVisitorLogs = debounce((logs) => {
  persistVisitorLogs(logs, false);
}, 2000);

function isPublicVisitorIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  var value = ip.trim();

  var ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    var parts = ipv4.slice(1).map(function (part) { return Number(part); });
    if (parts.some(function (part) { return part < 0 || part > 255; })) return false;
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return false;
    if (parts[0] === 169 && parts[1] === 254) return false;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;
    return true;
  }

  var lower = value.toLowerCase();
  if (lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) {
    return false;
  }
  return lower.includes(':');
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timeoutId = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;

  try {
    var response = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) throw new Error('IP lookup failed');
    return await response.json();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function resolveVisitorIp() {
  try {
    var edgeJson = await fetchJsonWithTimeout('/api/visitor-ip', 1800);
    if (edgeJson && isPublicVisitorIp(edgeJson.ip)) return edgeJson.ip.trim();
  } catch {
    // Local file preview or old deployments will not have the Worker endpoint yet.
  }

  try {
    var publicJson = await fetchJsonWithTimeout('https://api.ipify.org?format=json', 2500);
    if (publicJson && isPublicVisitorIp(publicJson.ip)) return publicJson.ip.trim();
  } catch {
    // Keep explicit failure label below.
  }

  return '公网 IP 获取失败';
}

async function initVisitorTracking() {
  App.currentVisitorKey = getOrCreateVisitorKey(window.localStorage);
  App.currentVisitorIp = await resolveVisitorIp();

  let logs = readJsonStorage('swnb_visitor_logs', []);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
  App.currentVisitorLogId = Date.now();

  const newLog = {
    id: App.currentVisitorLogId,
    ip: App.currentVisitorIp,
    page: '首页 (SW-nb 门户)',
    ua: navigator.userAgent || 'Unknown Browser',
    screen: (window.screen ? window.screen.width : 1920) + 'x' + (window.screen ? window.screen.height : 1080),
    timeStr: timeStr,
    startTime: App.currentVisitorLogId,
    staySeconds: 1,
    actions: [
      { time: timeStr, text: '进入 SW-nb 门户主页' }
    ]
  };

  logs.unshift(newLog);
  if (logs.length > 150) logs = logs.slice(0, 150);
  persistVisitorLogs(logs, false);

  let totalHits = parseInt(safeStorageGet(window.localStorage, 'swnb_total_hits', '0') || '0', 10) + 1;
  setStoredValue('swnb_total_hits', totalHits, '');

  // 每 15 秒更新停留时长 (原为 5 秒，降低频率提升性能)
  setInterval(updateCurrentStayDuration, 15000);
}

function updateCurrentStayDuration() {
  let logs = readJsonStorage('swnb_visitor_logs', []);
  const log = logs.find(l => l.id === App.currentVisitorLogId);
  if (log) {
    log.staySeconds = Math.max(1, Math.round((Date.now() - log.startTime) / 1000));
    debouncedSaveVisitorLogs(logs);
  }
}

function recordVisitorAction(actionText) {
  let logs = readJsonStorage('swnb_visitor_logs', []);
  const log = logs.find(l => l.id === App.currentVisitorLogId);
  if (log) {
    const timeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    log.actions = log.actions || [];
    log.actions.push({ time: timeStr, text: actionText });
    log.page = actionText.length > 20 ? actionText.substring(0, 20) + '...' : actionText;
    log.staySeconds = Math.max(1, Math.round((Date.now() - log.startTime) / 1000));
    debouncedSaveVisitorLogs(logs);
  }
}

function resetVisitorStats() {
  if (!confirm('确定要清空当前所有访客统计 Hits 与访客记录数据吗？清空后将完全从 0 重新统计。')) return;
  removeStoredValue('swnb_visitor_logs', '访客日志清理失败');
  setStoredValue('swnb_total_hits', '0', 'Hits 归零写入失败');
  showToast('所有访客统计数据已成功归零！', 'success');
  refreshAdminConsoleData();
}

function deleteVisitorLog(logId, event) {
  if (event) event.stopPropagation();
  if (!confirm('确定要单独删除这条访客数据吗？')) return;

  let logs = readJsonStorage('swnb_visitor_logs', []);
  logs = logs.filter(l => l.id !== logId);
  persistVisitorLogs(logs, true);
  showToast('该访客数据已成功删除！', 'success');
  refreshAdminConsoleData();
}

function openVisitorDetailModal(logId) {
  let logs = readJsonStorage('swnb_visitor_logs', []);
  const log = logs.find(l => l.id === logId);
  if (!log) return;

  const stayMin = Math.floor((log.staySeconds || 1) / 60);
  const staySec = (log.staySeconds || 1) % 60;
  const stayFormatted = stayMin > 0 ? stayMin + ' 分 ' + staySec + ' 秒' : staySec + ' 秒';

  const actions = log.actions || [{ time: log.timeStr, text: '进入主页' }];

  const container = document.getElementById('visitorDetailContent');
  if (container) {
    container.innerHTML =
      '<div class="visitor-info-card">' +
        '<div style="margin-bottom:8px;"><strong>访客标识 / IP:</strong> <span style="color:var(--accent); font-weight:700;">' + escapeHtml(log.ip) + '</span></div>' +
        '<div style="margin-bottom:8px;"><strong>累计停留时长:</strong> <strong style="color:var(--success); font-size:16px;">' + escapeHtml(stayFormatted) + '</strong></div>' +
        '<div style="margin-bottom:8px;"><strong>屏幕与时间:</strong> ' + escapeHtml(log.screen) + ' / 首次访问 ' + escapeHtml(log.timeStr) + '</div>' +
        '<div style="font-size:12.5px; color:var(--text-muted); word-break:break-all;"><strong>浏览器环境:</strong> ' + escapeHtml(log.ua) + '</div>' +
      '</div>' +
      '<h4 style="font-size:15px; font-weight:800; margin-bottom:14px; color:var(--text-main);">访客点击与浏览明细轨迹 (' + actions.length + ' 次动作)</h4>' +
      '<div class="visitor-timeline">' +
        actions.map(function (act) {
          return '<div class="timeline-item">' +
            '<span class="timeline-time">[' + escapeHtml(act.time) + ']</span>' +
            '<span>' + escapeHtml(act.text) + '</span>' +
          '</div>';
        }).join('') +
      '</div>';
    toggleModal('visitorDetailModal', true);
  }
}

function closeVisitorDetailModal() {
  toggleModal('visitorDetailModal', false);
}

// ==========================================
// MULTI-IMAGE HANDLING (ImageManager)
// ==========================================
async function handleMultiImageSelection(inputEl, previewGridId, isEdit) {
  if (!inputEl || !inputEl.files || inputEl.files.length === 0) return;

  const files = Array.from(inputEl.files);

  // 并行读取所有文件
  const readPromises = files.map(file => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  }));

  const base64Results = await Promise.all(readPromises);

  // 逐个添加到 ImageManager (包含压缩处理)
  for (const base64 of base64Results) {
    if (base64) await ImageManager.add(base64, isEdit);
  }

  renderMultiImagePreviews(previewGridId, isEdit);
}

function renderMultiImagePreviews(previewGridId, isEdit) {
  const grid = document.getElementById(previewGridId);
  if (!grid) return;

  const arr = ImageManager.getAll(isEdit);
  if (arr.length === 0) {
    grid.innerHTML = '';
    grid.style.display = 'none';
    return;
  }

  grid.style.display = 'flex';
  grid.innerHTML = arr.map(function (imgObj, idx) {
    var thumbUrl = getImageThumb(imgObj);
    return '<div class="thumb-item">' +
      '<img src="' + escapeAttribute(thumbUrl) + '" alt="预览图 ' + (idx + 1) + '">' +
      '<div class="thumb-del-btn" onclick="removeUploadedImage(' + idx + ', \'' + previewGridId + '\', ' + isEdit + ')" title="移除此图">✕</div>' +
    '</div>';
  }).join('');
}

function removeUploadedImage(index, previewGridId, isEdit) {
  ImageManager.remove(index, isEdit);
  renderMultiImagePreviews(previewGridId, isEdit);
}

function clearAllImages(inputId, previewGridId, isEdit) {
  var inputEl = document.getElementById(inputId);
  if (inputEl) inputEl.value = '';
  ImageManager.clear(isEdit);
  renderMultiImagePreviews(previewGridId, isEdit);
}

// 监听剪切板直接粘贴截图事件 (Ctrl+V / Cmd+V)
document.addEventListener('paste', async function (e) {
  if (!e.clipboardData || !e.clipboardData.items) return;
  var items = Array.from(e.clipboardData.items);

  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      var file = items[i].getAsFile();
      if (file) {
        var base64 = await new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function (evt) { resolve(evt.target.result); };
          reader.onerror = function () { resolve(null); };
          reader.readAsDataURL(file);
        });

        if (!base64) break;

        var pubModal = document.getElementById('publishModal');
        var editModal = document.getElementById('editArticleModal');

        if (pubModal && pubModal.classList.contains('active')) {
          await ImageManager.add(base64, false);
          renderMultiImagePreviews('pubImgPreviewGrid', false);
          showToast('截图已由剪切板粘贴读取！', 'success');
        } else if (editModal && editModal.classList.contains('active')) {
          await ImageManager.add(base64, true);
          renderMultiImagePreviews('editImgPreviewGrid', true);
          showToast('截图已由剪切板粘贴读取！', 'success');
        }
      }
      break;
    }
  }
});

// ==========================================
// DATA FETCHING & RENDERING
// ==========================================
async function loadPosts() {
  if (!App.supabaseClient) initSupabase();

  var renderedFromCache = loadCachedPosts();
  renderPostList();
  renderAdminArticleTable();
  if (!App.supabaseClient) return;

  try {
    var result = await App.supabaseClient
      .from('posts')
      .select('*')
      .order('id', { ascending: false });

    if (result.error) throw result.error;

    if (result.data && result.data.length > 0) {
      App.postsData = result.data.map(mapPostFromRecord);
      persistPostsCache(false);
    } else if (!renderedFromCache) {
      App.postsData = [];
    }
  } catch (e) {
    console.warn('读取云端异常，使用本地缓存:', e);
    if (!renderedFromCache) loadCachedPosts();
    showToast('云端同步失败，已加载本地缓存数据', 'error');
  }

  renderPostList();
  renderAdminArticleTable();
}

/** 使用 DocumentFragment 批量构建 DOM，替代整段 innerHTML 重写 */
function renderPostList() {
  var container = document.getElementById('postListContainer');
  if (!container) return;

  var heroPostCount = document.getElementById('heroPostCount');
  if (heroPostCount) heroPostCount.textContent = String(App.postsData.length || 0);

  if (App.postsData.length === 0) {
    container.innerHTML = '<div class="post-empty-state"><strong>这里还没有文章</strong><span>发布第一篇内容后，它会出现在这里。</span></div>';
    return;
  }

  var fragment = document.createDocumentFragment();

  App.postsData.forEach(function (post, index) {
    var article = document.createElement('article');
    var classNames = ['post-card'];
    var cycle = index % 6;
    if (cycle === 0 && post.images && post.images.length > 0) classNames.push('post-card--feature');
    else if (cycle >= 3) classNames.push('post-card--compact');
    article.className = classNames.join(' ');
    article.style.setProperty('--post-index', String(index));
    article.tabIndex = 0;
    article.setAttribute('role', 'button');
    article.setAttribute('aria-label', '阅读文章：' + String(post.title || '无标题文章'));
    article.onclick = function () { openArticleModal(post.id); };
    article.onkeydown = function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openArticleModal(post.id);
    };

    var imagesHtml = '';
    if (post.images && post.images.length > 0) {
      var imgTags = post.images.slice(0, 4).map(function (img) {
        var thumbUrl = getImageThumb(img);
        return thumbUrl
          ? '<img src="' + escapeAttribute(thumbUrl) + '" class="post-img" alt="' + escapeAttribute(post.title || '文章配图') + '" loading="lazy" decoding="async">'
          : '';
      }).filter(Boolean);
      if (imgTags.length > 0) {
        imagesHtml = '<div class="post-images-grid" data-count="' + imgTags.length + '">' + imgTags.join('') + '</div>';
      }
    }

    article.innerHTML =
      '<div class="post-content-wrap">' +
        '<div class="post-card-header">' +
          '<span class="topic-tag">' + escapeHtml(post.topic) + '</span>' +
          '<time class="post-time">' + escapeHtml(getPostDisplayTime(post)) + '</time>' +
        '</div>' +
        '<h3 class="post-title">' + escapeHtml(post.title) + '</h3>' +
        '<div class="post-snippet">' + escapeHtml(post.snippet) + '</div>' +
        '<div class="post-footer">' +
          '<span class="post-views-badge">阅读 ' + (post.views || 0) + '</span>' +
        '</div>' +
      '</div>' +
      imagesHtml;

    fragment.appendChild(article);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
}

// ==========================================
// PROJECT VIEW SWITCHER
// ==========================================
function switchProject(viewName, el) {
  document.querySelectorAll('.sidebar-item').forEach(function (item) {
    item.classList.remove('active');
  });
  if (el) el.classList.add('active');

  var blogView = document.getElementById('blogMainView');
  var iframeView = document.getElementById('subprojectViewer');
  var adminView = document.getElementById('adminConsoleView');
  var iframeEl = document.getElementById('subprojectIframe');
  var titleEl = document.getElementById('subprojectTitle');

  if (viewName === 'blog') {
    if (iframeView) iframeView.classList.remove('active');
    if (adminView) adminView.classList.remove('active');
    if (blogView) blogView.style.display = 'block';
    recordVisitorAction('返回前台主博客列表');
  } else if (viewName === 'phone') {
    if (blogView) blogView.style.display = 'none';
    if (adminView) adminView.classList.remove('active');
    if (iframeView) iframeView.classList.add('active');
    if (titleEl) titleEl.textContent = 'My bro-phone';
    if (iframeEl && iframeEl.getAttribute('src') !== 'bro-phone/index.html') {
      iframeEl.setAttribute('src', 'bro-phone/index.html');
    }
    recordVisitorAction('点击预览 bro-phone 演示');
  } else if (viewName === 'dongchedi') {
    recordVisitorAction('打开真实懂车帝动态归档');
    window.location.href = 'dongchedi-user/';
  } else if (viewName === 'admin') {
    if (!App.isAdminUnlocked) {
      openAdminAuthModal();
      return;
    }
    if (blogView) blogView.style.display = 'none';
    if (iframeView) iframeView.classList.remove('active');
    if (adminView) adminView.classList.add('active');
    refreshAdminConsoleData();
    recordVisitorAction('进入控制台后台');
  }
}

// ==========================================
// ADMIN MANAGEMENT & VISITOR CONSOLE
// ==========================================
function openAdminAuthModal() {
  document.getElementById('adminPassInput').value = '';
  document.getElementById('adminErrorMsg').style.display = 'none';
  toggleModal('adminAuthModal', true);
}

function closeAdminAuthModal() {
  toggleModal('adminAuthModal', false);
}

/** 管理员密码验证 - 交由 Supabase Edge Function 在服务端校验 */
async function verifyAdminAuth() {
  var pass = document.getElementById('adminPassInput').value.trim();
  if (!pass) {
    var blankErr = document.getElementById('adminErrorMsg');
    blankErr.textContent = '请输入管理员密码';
    blankErr.style.display = 'block';
    return;
  }

  try {
    var isValid = await callBlogApi('/admin/verify', { admin_password: pass });
    if (isValid) {
      setAdminUnlockState(pass);
      closeAdminAuthModal();
      var nextAction = App.pendingAdminAction;
      App.pendingAdminAction = '';
      var adminNav = document.getElementById('navAdminItem');
      switchProject('admin', adminNav);
      showToast('成功进入后台管理系统！', 'success');
      if (nextAction === 'publish') {
        openPublishModal();
      }
    } else {
      var err = document.getElementById('adminErrorMsg');
      err.textContent = '管理员密码错误';
      err.style.display = 'block';
    }
  } catch (e) {
    console.warn('密码验证异常:', e);
    showToast('云端验证失败，请稍后重试', 'error');
  }
}

function refreshAdminConsoleData() {
  var logs = readJsonStorage('swnb_visitor_logs', []);
  var totalHits = safeStorageGet(window.localStorage, 'swnb_total_hits', '0') || '0';

  var uniqueIps = new Set(logs.map(function (l) { return l.ip; })).size || 0;
  var uniqueViews = logs.length;

  document.getElementById('adminStatUniqueViews').textContent = uniqueViews;
  document.getElementById('adminStatTotalHits').textContent = totalHits;
  document.getElementById('adminStatUniqueIps').textContent = uniqueIps;
  document.getElementById('adminStatLogCount').textContent = logs.length;

  var tbody = document.getElementById('adminVisitorLogsTbody');
  if (tbody) {
    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">暂无访客日志（数据已归零）</td></tr>';
    } else {
      tbody.innerHTML = logs.slice(0, 30).map(function (l) {
        var stayMin = Math.floor((l.staySeconds || 1) / 60);
        var staySec = (l.staySeconds || 1) % 60;
        var stayBadge = stayMin > 0 ? stayMin + '分' + staySec + '秒' : staySec + '秒';
        var actCount = (l.actions && l.actions.length) || 1;
        return '<tr class="visitor-clickable-row" onclick="openVisitorDetailModal(' + l.id + ')" title="点击查看访客 ' + escapeHtml(l.ip) + ' 的全部点击与停留轨迹">' +
          '<td><strong style="color:var(--accent);">' + escapeHtml(l.ip) + '</strong></td>' +
          '<td>' +
            '<div>' + escapeHtml(l.page) + '</div>' +
            '<div style="font-size:11.5px;color:var(--success);font-weight:700;">停留: ' + escapeHtml(stayBadge) + ' (' + actCount + ' 次点击)</div>' +
          '</td>' +
          '<td style="font-size:12px;color:var(--text-muted);max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(l.ua) + '</td>' +
          '<td>' + escapeHtml(l.timeStr) + '</td>' +
          '<td onclick="event.stopPropagation()">' +
            '<button class="btn-sm btn-del" onclick="deleteVisitorLog(' + l.id + ', event)">删除</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }
  }

  renderAdminArticleTable();
}

function renderAdminArticleTable() {
  var tbody = document.getElementById('adminArticleTbody');
  if (!tbody) return;

  if (App.postsData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">暂无文章</td></tr>';
    return;
  }

  tbody.innerHTML = App.postsData.map(function (post) {
    return '<tr>' +
      '<td><strong>#' + post.id + '</strong></td>' +
      '<td><span style="color:var(--text-main);font-weight:700;">' + escapeHtml(post.title) + '</span> <span class="topic-tag" style="margin-left:6px;font-size:11px;">' + escapeHtml(post.topic) + '</span></td>' +
      '<td>' + (post.views || 0) + '</td>' +
      '<td>' +
        '<button class="btn-sm btn-edit" onclick="openEditArticleModal(' + post.id + ')">修改</button>' +
        '<button class="btn-sm btn-del" onclick="deleteArticle(' + post.id + ')">删除</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

async function deleteArticle(id) {
  if (!confirm('确认删除文章 #' + id + ' 吗？删除后不可恢复。')) return;
  if (!ensureAdminSession()) return;

  try {
    var deleted = await callBlogApi('/posts/delete', {
      admin_password: App.adminPassword,
      target_post_id: id
    });
    if (!deleted) {
      showToast('云端未找到对应文章', 'error');
      return;
    }
  } catch (e) {
    console.warn('云端删除提示:', e);
    showToast('云端删除失败，文章未从本地移除', 'error');
    return;
  }

  App.postsData = App.postsData.filter(function (p) { return p.id !== id; });
  persistPostsCache(true);
  showToast('文章已成功删除！', 'success');
  renderPostList();
  renderAdminArticleTable();
}

function openEditArticleModal(id) {
  var post = App.postsData.find(function (p) { return p.id === id; });
  if (!post) return;

  App.editingPostId = id;
  document.getElementById('editTitle').value = post.title;
  document.getElementById('editTopic').value = post.topic;

  clearAllImages('editImgFile', 'editImgPreviewGrid', true);
  if (post.images && post.images.length > 0) {
    ImageManager.loadFromData(post.images, true);
    renderMultiImagePreviews('editImgPreviewGrid', true);
  }
  document.getElementById('editImgUrl').value = '';

  var rawContent = post.contentText || htmlToPlainText(post.fullContent) || post.snippet;
  document.getElementById('editContent').value = rawContent;

  toggleModal('editArticleModal', true);
}

function closeEditArticleModal() {
  toggleModal('editArticleModal', false);
  App.editingPostId = null;
}

async function saveEditedArticle() {
  if (!App.editingPostId) return;
  if (!ensureAdminSession()) return;
  if (App.isSavingPost) {
    showToast('正在保存，请稍等', 'error');
    return;
  }

  var title = document.getElementById('editTitle').value.trim();
  var topic = document.getElementById('editTopic').value.trim() || '#日常分享';
  var extraUrl = document.getElementById('editImgUrl').value.trim();
  var content = document.getElementById('editContent').value.trim();

  if (!title || !content) {
    showToast('请填写完整的标题和正文！', 'error');
    return;
  }

  if (extraUrl) ImageManager.addUrl(extraUrl, true);
  var imgs = ImageManager.serialize(true);

  var snippet = content.length > 95 ? content.substring(0, 95) + '...' : content;

  var post = App.postsData.find(function (p) { return p.id === App.editingPostId; });
  if (!post) return;

  App.isSavingPost = true;
  setButtonBusy('editSubmitBtn', true, '保存中...');

  try {
    var updatedRow = await callBlogApi('/posts/update', {
      admin_password: App.adminPassword,
      target_post_id: App.editingPostId,
      next_title: title,
      next_topic: topic,
      next_snippet: snippet,
      next_content: content,
      next_images: JSON.stringify(imgs)
    });
    post = mapPostFromRecord(updatedRow);
  } catch (e) {
    console.warn('云端同步提示:', e);
    showToast('云端同步失败，修改未保存', 'error');
    return;
  } finally {
    App.isSavingPost = false;
    setButtonBusy('editSubmitBtn', false);
  }

  replacePostInState(post);
  persistPostsCache(true);
  showToast('文章修改成功并同步云端！', 'success');
  closeEditArticleModal();
  renderPostList();
  renderAdminArticleTable();
}

// ==========================================
// PUBLISHING & IP QUOTA (带签名校验)
// ==========================================
function openPublishModal() {
  if (!App.isAdminUnlocked) {
    App.pendingAdminAction = 'publish';
    openAdminAuthModal();
    return;
  }
  clearAllImages('pubImgFile', 'pubImgPreviewGrid', false);
  document.getElementById('pubTitle').value = '';
  document.getElementById('pubContent').value = '';
  document.getElementById('pubImgUrl').value = '';
  var topicEl = document.getElementById('pubTopic');
  if (topicEl) topicEl.value = '';
  toggleModal('publishModal', true);
}

function closePublishModal() {
  toggleModal('publishModal', false);
}

async function submitNewArticle() {
  if (!ensureAdminSession()) return;
  if (App.isSubmittingPost) {
    showToast('正在发布，请稍等', 'error');
    return;
  }

  var title = document.getElementById('pubTitle').value.trim();
  var topic = document.getElementById('pubTopic').value.trim() || '#日常分享';
  var content = document.getElementById('pubContent').value.trim();
  var extraUrl = document.getElementById('pubImgUrl').value.trim();

  if (!title || !content) {
    showToast('请填写完整的文章标题和正文', 'error');
    return;
  }

  if (extraUrl) ImageManager.addUrl(extraUrl, false);
  var imgs = ImageManager.serialize(false);

  var snippet = content.length > 95 ? content.substring(0, 95) + '...' : content;

  App.isSubmittingPost = true;
  setButtonBusy('publishSubmitBtn', true, '发布中...');

  try {
    var createdRow = await callBlogApi('/posts/create', {
      admin_password: App.adminPassword,
      title: title,
      topic: topic,
      snippet: snippet,
      content: content,
      time_str: new Date().toISOString(),
      images: JSON.stringify(imgs)
    });
    replacePostInState(mapPostFromRecord(createdRow));
  } catch (e) {
    console.warn('推送到云端提示:', e);
    showToast('云端同步失败，文章未保存', 'error');
    return;
  } finally {
    App.isSubmittingPost = false;
    setButtonBusy('publishSubmitBtn', false);
  }

  persistPostsCache(true);

  closePublishModal();
  showToast('文章发布成功。', 'success');
  recordVisitorAction('发布新文章: ' + title);
  renderPostList();
  renderAdminArticleTable();
}

// ==========================================
// ARTICLE DETAIL & VIEW COUNTER
// ==========================================

/** 下载图片 - 带 URL 安全校验 */
function downloadImage(url, filename) {
  var safeUrl = sanitizeImageUrl(url);
  if (!safeUrl) {
    showToast('无效的图片地址', 'error');
    return;
  }

  fetch(safeUrl)
    .then(function (response) { return response.blob(); })
    .then(function (blob) {
      var blobUrl = window.URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'SW-nb-image-' + Date.now() + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    })
    .catch(function () {
      var a = document.createElement('a');
      a.href = safeUrl;
      a.target = '_blank';
      a.download = filename || 'SW-nb-image-' + Date.now() + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
}

/** 按文章ID和图片索引下载原始高清图 - 避免在 onclick 属性中放入超长 base64 */
function downloadArticleImage(postId, imageIndex) {
  var post = App.postsData.find(function (p) { return p.id === postId; });
  if (!post || !post.images || !post.images[imageIndex]) return;
  var originalUrl = getImageOriginal(post.images[imageIndex]);
  downloadImage(originalUrl, 'SW-nb-HD-' + Date.now() + '.png');
}

async function syncArticleViewCount(post) {
  if (!post) return;

  try {
    var nextViews = await callBlogApi('/posts/view', {
      target_post_id: post.id,
      input_visitor_key: App.currentVisitorKey
    });

    if (typeof nextViews === 'number') {
      post.views = nextViews;
      persistPostsCache(false);
      renderPostList();

      var bodyEl = document.getElementById('articleDetailContent');
      if (bodyEl && document.getElementById('articleModal').classList.contains('active')) {
        openArticleModal(post.id, { skipSync: true });
      }
    }
  } catch (e) {
    console.warn('阅读量同步失败:', e);
  }
}

function openArticleModal(id, options) {
  var post = App.postsData.find(function (p) { return p.id === id; });
  if (!post) return;
  App.currentArticleId = id;

  if (!options || !options.skipAction) {
    recordVisitorAction('点击阅读文章: ' + post.title);
  }

  var bodyEl = document.getElementById('articleDetailContent');

  var imagesHtml = '';
  if (post.images && post.images.length > 0) {
    var imgBlocks = post.images.map(function (img, idx) {
      var thumbUrl = getImageThumb(img);
      if (!thumbUrl) return '';
      // 展示用压缩缩略图，下载按钮提供原始高清图
      return '<div class="article-img-box">' +
        '<button class="btn-download-img" onclick="event.stopPropagation(); downloadArticleImage(' + post.id + ', ' + idx + ')">' +
          '<span>⬇️</span> 下载图片' +
        '</button>' +
        '<img src="' + escapeAttribute(thumbUrl) + '" alt="文章配图" loading="lazy">' +
      '</div>';
    }).filter(Boolean).join('');

    if (imgBlocks) {
      imagesHtml = '<div style="margin-top:28px; display:flex; flex-direction:column; gap:20px;">' + imgBlocks + '</div>';
    }
  }

  bodyEl.innerHTML =
    '<div style="margin-bottom:16px; display:flex; align-items:center; justify-content:space-between;">' +
      '<div>' +
        '<span class="topic-tag">' + escapeHtml(post.topic) + '</span>' +
        '<span style="font-size:13px; color:var(--text-muted); margin-left:12px;">' + escapeHtml(getPostDisplayTime(post)) + '</span>' +
      '</div>' +
      '<span class="post-views-badge">阅读 ' + post.views + '</span>' +
    '</div>' +
    '<h2 style="font-size:26px; font-weight:800; color:var(--text-main); margin-bottom:24px; line-height:1.4;">' + escapeHtml(post.title) + '</h2>' +
    '<div class="article-content-full">' + post.fullContent + '</div>' +
    imagesHtml;

  toggleModal('articleModal', true);
  if (!options || !options.skipSync) {
    syncArticleViewCount(post);
  }
}

function closeArticleModal() {
  toggleModal('articleModal', false);
  App.currentArticleId = null;
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', function () {
  initThemeToggle();
  setupMotionReveals();
  initSupabase();
  initVisitorTracking();
  loadDongchediHero();
  loadPosts();
  setInterval(refreshRelativePostTimes, 60000);
});
