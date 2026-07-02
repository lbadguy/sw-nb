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
const getOrCreateVisitorKey = Shared.getOrCreateVisitorKey || function () { return 'visitor_ephemeral'; };
const normalizePostRecord = Shared.normalizePostRecord || function (item) { return item; };
const safeStorageGet = Shared.safeStorageGet || function () { return null; };
const safeStorageSet = Shared.safeStorageSet || function () { return false; };
const safeStorageRemove = Shared.safeStorageRemove || function () { return false; };
const THEME_STORAGE_KEY = 'swnb_theme';

/** 图片 URL 安全校验 — 仅允许 http/https/data 协议 */
function sanitizeImageUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (trimmed.startsWith('data:image/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return trimmed;
    return '';
  } catch {
    return '';
  }
}

/** 防抖函数 — 延迟执行，合并高频调用 */
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/** Canvas 图片压缩 — 生成预览缩略图，保留原图用于下载 */
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

/** 通用 Modal 切换 */
function toggleModal(modalId, show) {
  const modal = document.getElementById(modalId);
  if (modal) {
    if (show) modal.classList.add('active');
    else modal.classList.remove('active');
  }
}

function updateThemeToggleButton(theme) {
  var btn = document.getElementById('themeToggleBtn');
  if (!btn) return;

  var isDark = theme === 'dark';
  var nextLabel = isDark ? '浅色' : '深色';
  btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  btn.setAttribute('title', '切换到' + nextLabel + '模式');
  btn.innerHTML = isDark
    ? '<span>☀️</span><span>浅色</span>'
    : '<span>🌙</span><span>深色</span>';
}

function applyTheme(theme) {
  var resolvedTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = resolvedTheme;
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

// ==========================================
// APP STATE NAMESPACE — 收敛全局变量
// ==========================================
const App = {
  supabaseClient: null,
  adminPassword: '',
  isAdminUnlocked: false,
  pendingAdminAction: '',
  currentVisitorIp: '127.0.0.1 (真实访客)',
  currentVisitorKey: 'visitor_ephemeral',
  currentVisitorLogId: Date.now(),
  editingPostId: null,
  // 默认/回退文章数据
  postsData: [
    {
      id: 1,
      title: '🚀 [系统公告] SW-nb 个人全栈门户与云端实时动态发布上线！',
      topic: '#全站公告',
      snippet: '欢迎来到 SW-nb 全新门户！本站已成功接入 Supabase 云端数据库，支持全网实时动态发布、单 IP 每日发帖频控防刷保护，支持批量传图与剪切板直接粘贴图片！',
      time: '刚刚',
      views: 1,
      images: [
        'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&auto=format&fit=crop&q=80'
      ],
      fullContent: '<p>欢迎来到 SW-nb 全新门户！本站已成功接入 Supabase 云端数据库，支持全网实时动态发布、单 IP 每日发帖频控防刷保护，支持批量传图与剪切板直接粘贴图片！</p><p>已彻底移除繁杂的点赞与收藏，转为精炼纯粹的点击阅读量统计。点击正文里的每一张照片右上角均可直接下载原图！</p>'
    }
  ]
};

// ==========================================
// IMAGE MANAGER — 统一管理发布/编辑的多图状态
// ==========================================
const ImageManager = {
  // 每张图存储为 { thumb: '压缩预览', original: '原始高清' }
  uploadImages: [],
  editImages: [],

  /** 添加本地图片 (自动生成压缩缩略图，保留原始高清图) */
  async add(base64, isEdit) {
    const arr = isEdit ? this.editImages : this.uploadImages;
    if (arr.length >= 9) {
      showToast('最多上传 9 张图片', 'error');
      return false;
    }
    const original = base64;
    const thumb = await compressImage(base64, 1200, 0.7);
    arr.push({ thumb, original });
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
      if (typeof img === 'string') return { thumb: img, original: img };
      return img;
    });
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

async function callRpc(functionName, args) {
  if (!App.supabaseClient) initSupabase();
  if (!App.supabaseClient) {
    throw new Error('Supabase client unavailable');
  }

  const result = await App.supabaseClient.rpc(functionName, args);
  if (result.error) throw result.error;
  return result.data;
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

function replacePostInState(post) {
  const existingIndex = App.postsData.findIndex(function (item) { return item.id === post.id; });
  if (existingIndex >= 0) App.postsData.splice(existingIndex, 1, post);
  else App.postsData.unshift(post);
}

function setAdminUnlockState(pass) {
  App.adminPassword = pass;
  App.isAdminUnlocked = true;
  const adminNav = document.getElementById('navAdminItem');
  if (adminNav) adminNav.style.display = 'flex';
}

function clearAdminUnlockState() {
  App.adminPassword = '';
  App.isAdminUnlocked = false;
}

function loadCachedPosts() {
  const localSaved = readJsonStorage('swnb_premium_posts', []);
  if (Array.isArray(localSaved) && localSaved.length > 0) {
    App.postsData = localSaved;
    return true;
  }
  return false;
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
  const icon = type === 'error' ? '⚠️' : '✨';
  toast.innerHTML =
    '<span style="font-size:18px;">' + icon + '</span>' +
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

async function initVisitorTracking() {
  App.currentVisitorKey = getOrCreateVisitorKey(window.localStorage);

  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const json = await res.json();
    if (json.ip) App.currentVisitorIp = json.ip;
  } catch {
    // 静默降级，使用默认 IP 标识
  }

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
  if (!confirm('⚠️ 确定要清空当前所有访客统计 Hits 与访客记录数据吗？清空后将完全从 0 重新统计！')) return;
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
        '<div style="margin-bottom:8px;"><strong>🌐 访客标识 / IP:</strong> <span style="color:var(--primary); font-weight:700;">' + escapeHtml(log.ip) + '</span></div>' +
        '<div style="margin-bottom:8px;"><strong>⏱️ 累计停留时长:</strong> <strong style="color:#10b981; font-size:16px;">' + escapeHtml(stayFormatted) + '</strong></div>' +
        '<div style="margin-bottom:8px;"><strong>🖥️ 屏幕与时间:</strong> ' + escapeHtml(log.screen) + ' · 首次访问 ' + escapeHtml(log.timeStr) + '</div>' +
        '<div style="font-size:12.5px; color:var(--text-muted); word-break:break-all;"><strong>浏览器环境:</strong> ' + escapeHtml(log.ua) + '</div>' +
      '</div>' +
      '<h4 style="font-size:15px; font-weight:800; margin-bottom:14px; color:var(--text-main);">📌 访客点击与浏览明细轨迹 (' + actions.length + ' 次动作)</h4>' +
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
      '<img src="' + thumbUrl + '" alt="预览图 ' + (idx + 1) + '">' +
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

  if (App.supabaseClient) {
    try {
      var result = await App.supabaseClient
        .from('posts')
        .select('*')
        .order('id', { ascending: false });

      if (result.error) throw result.error;

      if (result.data && result.data.length > 0) {
        App.postsData = result.data.map(mapPostFromRecord);
        persistPostsCache(false);
      } else if (!loadCachedPosts()) {
        App.postsData = [];
      }
    } catch (e) {
      console.warn('读取云端异常，使用本地缓存:', e);
      loadCachedPosts();
      showToast('云端同步失败，已加载本地缓存数据', 'error');
    }
  } else {
    loadCachedPosts();
  }
  renderPostList();
  renderAdminArticleTable();
}

/** 使用 DocumentFragment 批量构建 DOM，替代整段 innerHTML 重写 */
function renderPostList() {
  var container = document.getElementById('postListContainer');
  if (!container) return;

  if (App.postsData.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:80px 0;color:var(--text-muted);font-size:16px;">暂无相关文章</div>';
    return;
  }

  var fragment = document.createDocumentFragment();

  App.postsData.forEach(function (post) {
    var article = document.createElement('article');
    article.className = 'post-card';
    article.onclick = function () { openArticleModal(post.id); };

    var imagesHtml = '';
    if (post.images && post.images.length > 0) {
      var imgTags = post.images.map(function (img) {
        var thumbUrl = getImageThumb(img);
        return thumbUrl
          ? '<img src="' + thumbUrl + '" class="post-img" alt="配图" loading="lazy">'
          : '';
      }).filter(Boolean).join('');
      if (imgTags) {
        imagesHtml = '<div class="post-images-grid">' + imgTags + '</div>';
      }
    }

    article.innerHTML =
      '<div class="post-card-header">' +
        '<span class="topic-tag">' + escapeHtml(post.topic) + '</span>' +
        '<span class="post-time">📅 ' + escapeHtml(post.time) + '</span>' +
      '</div>' +
      '<h3 class="post-title">' + escapeHtml(post.title) + '</h3>' +
      '<div class="post-snippet">' + escapeHtml(post.snippet) + '</div>' +
      imagesHtml +
      '<div class="post-footer">' +
        '<span class="post-views-badge">👁️ ' + (post.views || 0) + ' 次阅读</span>' +
      '</div>';

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
    if (titleEl) titleEl.innerHTML = '<span>📱</span> My bro-phone';
    if (iframeEl && iframeEl.getAttribute('src') !== 'bro-phone/index.html') {
      iframeEl.setAttribute('src', 'bro-phone/index.html');
    }
    recordVisitorAction('点击预览 bro-phone 演示');
  } else if (viewName === 'dongchedi') {
    if (blogView) blogView.style.display = 'none';
    if (adminView) adminView.classList.remove('active');
    if (iframeView) iframeView.classList.add('active');
    if (titleEl) titleEl.innerHTML = '<span>🚘</span> 我的主页（？';
    if (iframeEl && iframeEl.getAttribute('src') !== 'dongchedi-user/index.html') {
      iframeEl.setAttribute('src', 'dongchedi-user/index.html');
    }
    recordVisitorAction('点击预览懂车帝复刻页');
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

/** 管理员密码验证 — 交由 Supabase RPC 在服务端校验 */
async function verifyAdminAuth() {
  var pass = document.getElementById('adminPassInput').value.trim();
  if (!pass) {
    var blankErr = document.getElementById('adminErrorMsg');
    blankErr.textContent = '❌ 请输入管理员密码';
    blankErr.style.display = 'block';
    return;
  }

  try {
    var isValid = await callRpc('verify_admin_password_rpc', { admin_password: pass });
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
      err.textContent = '❌ 管理员密码错误';
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
          '<td><strong style="color:var(--primary);">' + escapeHtml(l.ip) + '</strong></td>' +
          '<td>' +
            '<div>' + escapeHtml(l.page) + '</div>' +
            '<div style="font-size:11.5px;color:#10b981;font-weight:700;">⏱️ 停留: ' + escapeHtml(stayBadge) + ' (' + actCount + ' 次点击)</div>' +
          '</td>' +
          '<td style="font-size:12px;color:var(--text-muted);max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(l.ua) + '</td>' +
          '<td>🕒 ' + escapeHtml(l.timeStr) + '</td>' +
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
      '<td>👁️ ' + (post.views || 0) + '</td>' +
      '<td>' +
        '<button class="btn-sm btn-edit" onclick="openEditArticleModal(' + post.id + ')">修改</button>' +
        '<button class="btn-sm btn-del" onclick="deleteArticle(' + post.id + ')">删除</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

async function deleteArticle(id) {
  if (!confirm('⚠️ 确认删除文章 #' + id + ' 吗？删除后不可恢复！')) return;
  if (!ensureAdminSession()) return;

  try {
    var deleted = await callRpc('delete_post_rpc', {
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

  var rawContent = post.fullContent
    ? post.fullContent.replace(/<\/?p>/g, '\n').trim()
    : post.snippet;
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

  try {
    var updatedRow = await callRpc('update_post_rpc', {
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

  try {
    var createdRow = await callRpc('create_post_rpc', {
      admin_password: App.adminPassword,
      title: title,
      topic: topic,
      snippet: snippet,
      content: content,
      time_str: '刚刚',
      images: JSON.stringify(imgs)
    });
    replacePostInState(mapPostFromRecord(createdRow));
  } catch (e) {
    console.warn('推送到云端提示:', e);
    showToast('云端同步失败，文章未保存', 'error');
    return;
  }

  persistPostsCache(true);

  closePublishModal();
  showToast('🚀 文章发布成功！', 'success');
  recordVisitorAction('发布新文章: ' + title);
  renderPostList();
  renderAdminArticleTable();
}

// ==========================================
// ARTICLE DETAIL & VIEW COUNTER
// ==========================================

/** 下载图片 — 带 URL 安全校验 */
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

/** 按文章ID和图片索引下载原始高清图 — 避免在 onclick 属性中放入超长 base64 */
function downloadArticleImage(postId, imageIndex) {
  var post = App.postsData.find(function (p) { return p.id === postId; });
  if (!post || !post.images || !post.images[imageIndex]) return;
  var originalUrl = getImageOriginal(post.images[imageIndex]);
  downloadImage(originalUrl, 'SW-nb-HD-' + Date.now() + '.png');
}

async function syncArticleViewCount(post) {
  if (!post || !App.supabaseClient) return;

  try {
    var nextViews = await callRpc('increment_post_views_rpc', {
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

  recordVisitorAction('点击阅读文章: ' + post.title);

  var bodyEl = document.getElementById('articleDetailContent');

  var imagesHtml = '';
  if (post.images && post.images.length > 0) {
    var imgBlocks = post.images.map(function (img, idx) {
      var thumbUrl = getImageThumb(img);
      if (!thumbUrl) return '';
      // 展示用压缩缩略图，下载按钮提供原始高清图
      return '<div class="article-img-box">' +
        '<button class="btn-download-img" onclick="event.stopPropagation(); downloadArticleImage(' + post.id + ', ' + idx + ')">' +
          '<span>⬇️</span> 下载高清原图' +
        '</button>' +
        '<img src="' + thumbUrl + '" alt="文章配图" loading="lazy">' +
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
        '<span style="font-size:13px; color:var(--text-muted); margin-left:12px;">📅 ' + escapeHtml(post.time) + '</span>' +
      '</div>' +
      '<span class="post-views-badge">👁️ ' + post.views + ' 次浏览</span>' +
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
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', function () {
  initThemeToggle();
  initSupabase();
  initVisitorTracking();
  loadPosts();
});
