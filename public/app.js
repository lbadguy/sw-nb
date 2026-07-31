const Shared = window.SwnbShared || {};
const escapeHtml = Shared.escapeHtml || ((value) => String(value || ''));
const formatRelativeTime = Shared.formatRelativeTime || ((value) => String(value || ''));
const normalizePostRecord = Shared.normalizePostRecord || ((value) => value);
const safeStorageGet = Shared.safeStorageGet || (() => null);
const safeStorageSet = Shared.safeStorageSet || (() => false);

const SUPABASE_URL = 'https://szbgotjjhurfxhyktbus.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_swGyzcP9s0tTZwf0vgF5cw_5h5VV2ww';
const POSTS_CACHE_KEY = 'swnb_posts_cache_v2';
const THEME_KEY = 'swnb_theme';
const ACTIVITY_KEY = 'swnb_local_activity_v2';
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const state = {
  posts: [],
  adminPassword: '',
  pendingAction: '',
  editorImages: [],
  activePostId: null,
  editorBusy: false,
};

const fallbackPost = normalizePostRecord({
  id: 1,
  title: 'SW-NB 信号系统重新上线',
  topic: '#系统记录',
  content: '这是一次从传统个人主页到数字路书的重构。\n文章、道路与机器被放进同一套视觉语言里，等待下一段真实记录。',
  created_at: '2026-07-03T14:20:00.000Z',
  likes: 1,
  images: JSON.stringify([{ thumb: 'assets/road-story.jpg', original: 'assets/road-story.jpg' }]),
});

function icons(root = document) {
  if (window.lucide) window.lucide.createIcons({ root });
}

function safeImageUrl(value) {
  if (!value) return '';
  const source = String(value).trim();
  if (/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(source)) return source;
  if (/^(assets\/|\.\/assets\/)/.test(source)) return source;
  try {
    const url = new URL(source, window.location.href);
    if (url.protocol === 'https:' && url.origin !== 'null') return url.href;
  } catch {
    return '';
  }
  return '';
}

function postImages(post) {
  const images = Array.isArray(post.images) ? post.images : [];
  return images.flatMap((image) => {
    const thumb = safeImageUrl(typeof image === 'string' ? image : image.thumb || image.original);
    const original = safeImageUrl(typeof image === 'string' ? image : image.original || image.thumb);
    return thumb ? [{ thumb, original: original || thumb }] : [];
  });
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function toast(message, type = 'success') {
  const region = document.getElementById('toastRegion');
  const item = document.createElement('div');
  item.className = `toast${type === 'error' ? ' is-error' : ''}`;
  item.innerHTML = `<i data-lucide="${type === 'error' ? 'triangle-alert' : 'sparkles'}"></i><span>${escapeHtml(message)}</span>`;
  region.appendChild(item);
  icons(item);
  window.setTimeout(() => item.remove(), 4200);
}

function recordActivity(label) {
  const current = parseJson(safeStorageGet(localStorage, ACTIVITY_KEY, '[]'), []);
  const entries = Array.isArray(current) ? current : [];
  entries.unshift({ label: String(label).slice(0, 120), at: new Date().toISOString() });
  safeStorageSet(localStorage, ACTIVITY_KEY, JSON.stringify(entries.slice(0, 80)));
}

function activityEntries() {
  const value = parseJson(safeStorageGet(localStorage, ACTIVITY_KEY, '[]'), []);
  return Array.isArray(value) ? value : [];
}

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
  icons(dialog);
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function updateThemeButton(theme) {
  const button = document.getElementById('themeToggle');
  if (!button) return;
  button.innerHTML = `<i data-lucide="${theme === 'dark' ? 'sun' : 'moon'}"></i>`;
  button.setAttribute('aria-label', theme === 'dark' ? '切换到浅色' : '切换到深色');
  button.title = button.getAttribute('aria-label');
  icons(button);
}

function setTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  safeStorageSet(localStorage, THEME_KEY, next);
  updateThemeButton(next);
}

function initTheme() {
  const stored = safeStorageGet(localStorage, THEME_KEY, '');
  const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  setTheme(stored === 'light' || stored === 'dark' ? stored : preferred);
}

async function fetchPosts() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=*&order=id.desc`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!response.ok) throw new Error('posts unavailable');
  return await response.json();
}

async function callBlogApi(path, payload) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/blog-api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) state.adminPassword = '';
    throw new Error(result.error || 'request failed');
  }
  return result.data;
}

function cachePosts() {
  safeStorageSet(localStorage, POSTS_CACHE_KEY, JSON.stringify(state.posts));
}

function loadCachedPosts() {
  const cached = parseJson(safeStorageGet(localStorage, POSTS_CACHE_KEY, '[]'), []);
  if (!Array.isArray(cached) || cached.length === 0) return false;
  state.posts = cached.map(normalizePostRecord);
  return true;
}

function renderPosts() {
  const container = document.getElementById('postList');
  const count = state.posts.length;
  document.querySelectorAll('[data-post-count]').forEach((node) => { node.textContent = String(count).padStart(2, '0'); });

  if (!count) {
    container.innerHTML = '<div class="empty-state">NO TRANSMISSIONS FOUND / 暂无文章</div>';
    return;
  }

  container.innerHTML = state.posts.map((post, index) => {
    const images = postImages(post);
    const image = images[0]?.thumb;
    const summary = escapeHtml(post.snippet || post.contentText || '').slice(0, 170);
    return `
      <article class="post-entry reveal" tabindex="0" role="button" data-post-id="${Number(post.id)}" aria-label="阅读 ${escapeHtml(post.title)}">
        <span class="post-index">${String(index + 1).padStart(2, '0')}</span>
        <div>
          <h3 class="post-name">${escapeHtml(post.title)}</h3>
          <div class="post-meta"><span>${escapeHtml(post.topic)}</span><span>${escapeHtml(formatRelativeTime(post.timeSource) || post.time || '时间未知')}</span><span>${Number(post.views || 0)} VIEWS</span></div>
          <p class="post-summary">${summary}</p>
        </div>
        ${image ? `<img class="post-thumb" src="${escapeHtml(image)}" alt="" loading="lazy">` : '<div class="post-thumb post-thumb-empty"></div>'}
        <span class="post-arrow"><i data-lucide="arrow-up-right"></i></span>
      </article>`;
  }).join('');
  icons(container);
  observeReveals(container);
}

async function loadPosts() {
  const hadCache = loadCachedPosts();
  if (!hadCache) state.posts = [fallbackPost];
  renderPosts();

  const status = document.getElementById('archiveStatus');
  try {
    const rows = await fetchPosts();
    state.posts = Array.isArray(rows) && rows.length ? rows.map(normalizePostRecord) : [];
    cachePosts();
    renderPosts();
    status.textContent = 'LIVE';
  } catch (error) {
    console.warn('Post synchronization failed', error);
    status.textContent = hadCache ? 'CACHED' : 'OFFLINE';
    toast('云端暂时不可用，正在展示最近快照', 'error');
  }
}

function articleGallery(post) {
  const images = postImages(post);
  if (!images.length) return '';
  return `<div class="article-gallery">${images.map((image, index) => `
    <figure>
      <a href="${escapeHtml(image.original)}" target="_blank" rel="noopener noreferrer" title="打开原图 ${index + 1}">
        <img src="${escapeHtml(image.thumb)}" alt="文章图片 ${index + 1}" loading="lazy">
      </a>
    </figure>`).join('')}</div>`;
}

function renderArticle(post) {
  const content = document.getElementById('articleContent');
  const adminActions = state.adminPassword ? `
    <div class="article-actions">
      <button class="command-button is-ghost" type="button" data-edit-post="${Number(post.id)}"><i data-lucide="square-pen"></i>编辑</button>
      <button class="command-button is-ghost" type="button" data-delete-post="${Number(post.id)}"><i data-lucide="trash-2"></i>删除</button>
    </div>` : '';

  content.innerHTML = `
    <div class="article-topic">${escapeHtml(post.topic)} / TRANSMISSION ${escapeHtml(String(post.id))}</div>
    <h2>${escapeHtml(post.title)}</h2>
    <div class="article-byline"><span>${escapeHtml(formatRelativeTime(post.timeSource) || post.time || '时间未知')}</span><span>${Number(post.views || 0)} VIEWS</span></div>
    <div class="article-body">${post.fullContent || `<p>${escapeHtml(post.contentText || '')}</p>`}</div>
    ${articleGallery(post)}
    ${adminActions}`;
  icons(content);
}

async function openArticle(postId, skipView = false) {
  const post = state.posts.find((item) => Number(item.id) === Number(postId));
  if (!post) return;
  state.activePostId = Number(post.id);
  renderArticle(post);
  openDialog(document.getElementById('articleDialog'));
  recordActivity(`阅读：${post.title}`);

  if (!skipView) {
    try {
      const nextViews = await callBlogApi('/posts/view', { target_post_id: Number(post.id) });
      if (Number.isFinite(Number(nextViews))) {
        post.views = Number(nextViews);
        cachePosts();
        renderPosts();
        renderArticle(post);
      }
    } catch (error) {
      console.warn('View synchronization failed', error);
    }
  }
}

function requireAdmin(action) {
  if (state.adminPassword) return true;
  state.pendingAction = action;
  openDialog(document.getElementById('authDialog'));
  return false;
}

function resetEditor() {
  document.getElementById('editorForm').reset();
  document.getElementById('editorPostId').value = '';
  document.getElementById('editorTitle').textContent = '发布新记录';
  state.editorImages = [];
  renderImagePreview();
}

function openEditor(postId) {
  if (!requireAdmin(postId ? `edit:${postId}` : 'new')) return;
  resetEditor();
  if (postId) {
    const post = state.posts.find((item) => Number(item.id) === Number(postId));
    if (!post) return;
    document.getElementById('editorPostId').value = String(post.id);
    document.getElementById('editorTitle').textContent = '编辑云端记录';
    document.getElementById('postTitle').value = post.title || '';
    document.getElementById('postTopic').value = post.topic || '';
    document.getElementById('postBody').value = post.contentText || '';
    state.editorImages = postImages(post);
    renderImagePreview();
  }
  closeDialog(document.getElementById('articleDialog'));
  openDialog(document.getElementById('editorDialog'));
}

function renderImagePreview() {
  const container = document.getElementById('imagePreview');
  container.innerHTML = state.editorImages.map((image, index) => `
    <div class="preview-item">
      <img src="${escapeHtml(image.thumb)}" alt="待上传图片 ${index + 1}">
      <button class="preview-remove" type="button" data-remove-image="${index}" aria-label="移除图片 ${index + 1}"><i data-lucide="x"></i></button>
    </div>`).join('');
  icons(container);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImage(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(image.width, 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.78));
    };
    image.onerror = () => resolve('');
    image.src = dataUrl;
  });
}

async function addSelectedImages(files) {
  for (const file of Array.from(files)) {
    if (state.editorImages.length >= MAX_IMAGES) {
      toast(`最多上传 ${MAX_IMAGES} 张图片`, 'error');
      break;
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_IMAGE_BYTES) {
      toast(`${file.name} 格式不支持或超过 8MB`, 'error');
      continue;
    }
    const compressed = await compressImage(await fileToDataUrl(file));
    if (compressed) state.editorImages.push({ thumb: compressed, original: compressed });
  }
  renderImagePreview();
}

function setEditorBusy(busy) {
  state.editorBusy = busy;
  const button = document.getElementById('editorSubmit');
  button.disabled = busy;
  button.innerHTML = busy
    ? '<i data-lucide="loader-circle"></i>正在同步'
    : '<i data-lucide="send"></i>发布到云端';
  icons(button);
}

async function submitEditor(event) {
  event.preventDefault();
  if (state.editorBusy || !requireAdmin('new')) return;

  const postId = Number(document.getElementById('editorPostId').value || 0);
  const title = document.getElementById('postTitle').value.trim();
  const topic = document.getElementById('postTopic').value.trim() || '#日常分享';
  const content = document.getElementById('postBody').value.trim();
  const imageUrl = safeImageUrl(document.getElementById('postImageUrl').value);
  if (!title || !content) return toast('标题和正文不能为空', 'error');

  const images = [...state.editorImages];
  if (imageUrl && images.length < MAX_IMAGES) images.push({ thumb: imageUrl, original: imageUrl });
  const snippet = content.length > 180 ? `${content.slice(0, 180)}…` : content;
  setEditorBusy(true);

  try {
    let row;
    if (postId) {
      row = await callBlogApi('/posts/update', {
        admin_password: state.adminPassword,
        target_post_id: postId,
        next_title: title,
        next_topic: topic,
        next_snippet: snippet,
        next_content: content,
        next_images: JSON.stringify(images),
      });
      state.posts = state.posts.map((post) => Number(post.id) === postId ? normalizePostRecord(row) : post);
      recordActivity(`编辑文章：${title}`);
    } else {
      row = await callBlogApi('/posts/create', {
        admin_password: state.adminPassword,
        title,
        topic,
        snippet,
        content,
        time_str: new Date().toISOString(),
        images: JSON.stringify(images),
      });
      state.posts.unshift(normalizePostRecord(row));
      recordActivity(`发布文章：${title}`);
    }
    cachePosts();
    renderPosts();
    closeDialog(document.getElementById('editorDialog'));
    toast(postId ? '文章已安全更新' : '新记录已发布');
  } catch (error) {
    toast(error.message === 'too many attempts' ? '操作过于频繁，请稍后再试' : '云端同步失败，请检查会话或网络', 'error');
  } finally {
    setEditorBusy(false);
  }
}

async function deletePost(postId) {
  if (!requireAdmin(`delete:${postId}`)) return;
  const post = state.posts.find((item) => Number(item.id) === Number(postId));
  if (!post || !window.confirm(`确认删除《${post.title}》？此操作不可撤销。`)) return;
  try {
    await callBlogApi('/posts/delete', { admin_password: state.adminPassword, target_post_id: Number(postId) });
    state.posts = state.posts.filter((item) => Number(item.id) !== Number(postId));
    cachePosts();
    renderPosts();
    closeDialog(document.getElementById('articleDialog'));
    recordActivity(`删除文章：${post.title}`);
    toast('文章已删除');
  } catch {
    toast('删除失败，请重新验证管理员会话', 'error');
  }
}

async function verifyAdmin(event) {
  event.preventDefault();
  const password = document.getElementById('adminPassword').value;
  const errorNode = document.getElementById('authError');
  errorNode.textContent = '';
  try {
    const valid = await callBlogApi('/admin/verify', { admin_password: password });
    if (!valid) throw new Error('invalid');
    state.adminPassword = password;
    document.getElementById('adminPassword').value = '';
    closeDialog(document.getElementById('authDialog'));
    toast('安全编辑会话已建立');
    const action = state.pendingAction;
    state.pendingAction = '';
    if (action === 'new') openEditor();
    else if (action.startsWith('edit:')) openEditor(Number(action.split(':')[1]));
    else if (action.startsWith('delete:')) deletePost(Number(action.split(':')[1]));
  } catch (error) {
    errorNode.textContent = error.message === 'too many attempts' ? '尝试次数过多，请稍后重试。' : '验证失败，请检查密码。';
  }
}

function renderActivity() {
  const entries = activityEntries();
  const today = new Date().toDateString();
  const todayCount = entries.filter((entry) => new Date(entry.at).toDateString() === today).length;
  const uniqueTypes = new Set(entries.map((entry) => entry.label.split('：')[0])).size;
  document.getElementById('activitySummary').innerHTML = `
    <div class="activity-stat"><b>${entries.length}</b><span>本机动作</span></div>
    <div class="activity-stat"><b>${todayCount}</b><span>今日动作</span></div>
    <div class="activity-stat"><b>${uniqueTypes}</b><span>动作类型</span></div>`;
  document.getElementById('activityList').innerHTML = entries.length
    ? entries.map((entry) => `<li><span>${escapeHtml(entry.label)}</span><time>${escapeHtml(formatRelativeTime(entry.at) || new Date(entry.at).toLocaleString('zh-CN'))}</time></li>`).join('')
    : '<li><span>暂无本机活动</span></li>';
}

async function loadDongchediPreview() {
  const preview = document.getElementById('dongchediPreview');
  if (!preview) return;
  try {
    const response = await fetch('/api/dongchedi-profile', { headers: { Accept: 'application/json' } });
    const snapshot = await response.json();
    if (!response.ok || !Array.isArray(snapshot.posts)) throw new Error('snapshot unavailable');
    const status = snapshot.cache?.status === 'stale' ? 'REFRESHING' : 'LIVE';
    preview.textContent = `${status} / ${snapshot.posts.length} POSTS / DAILY CACHE`;
  } catch {
    preview.textContent = 'ARCHIVE / RETRY IN PROJECT';
  }
}

function openProject(name) {
  const config = name === 'phone'
    ? { title: 'SW-NB 15 PRO MAX / LAUNCH', src: 'bro-phone/index.html' }
    : { title: 'DONGCHEDI / DAILY MIRROR', src: 'dongchedi-user/index.html' };
  document.getElementById('viewerTitle').textContent = config.title;
  document.getElementById('projectFrame').src = config.src;
  const viewer = document.getElementById('projectViewer');
  viewer.classList.add('is-open');
  viewer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  recordActivity(`打开项目：${config.title}`);
}

function closeProject() {
  const viewer = document.getElementById('projectViewer');
  viewer.classList.remove('is-open');
  viewer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  window.setTimeout(() => { document.getElementById('projectFrame').src = ''; }, 700);
}

let revealObserver;
function observeReveals(root = document) {
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
  }
  root.querySelectorAll('.reveal:not(.is-visible)').forEach((element) => revealObserver.observe(element));
}

function initCursor() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const cursor = document.getElementById('cursorDot');
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  window.addEventListener('pointermove', (event) => {
    targetX = event.clientX;
    targetY = event.clientY;
    cursor.style.opacity = '1';
  }, { passive: true });
  document.addEventListener('pointerover', (event) => {
    cursor.classList.toggle('is-active', Boolean(event.target.closest('a, button, [role="button"]')));
  });
  const tick = () => {
    currentX += (targetX - currentX) * 0.18;
    currentY += (targetY - currentY) * 0.18;
    cursor.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%)`;
    requestAnimationFrame(tick);
  };
  tick();
}

function initCanvas() {
  const canvas = document.getElementById('signalCanvas');
  const context = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let nodes = [];
  let pointer = { x: -1000, y: -1000 };
  let frame = 0;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.min(42, Math.max(18, Math.round(window.innerWidth * window.innerHeight / 42000)));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.24,
      vy: (Math.random() - 0.5) * 0.24,
    }));
  };

  const draw = () => {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line');
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--signal');
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const dx = node.x - pointer.x;
      const dy = node.y - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 130 && distance > 0) {
        node.vx += (dx / distance) * 0.02;
        node.vy += (dy / distance) * 0.02;
      }
      node.vx *= 0.995;
      node.vy *= 0.995;
      node.x += node.vx;
      node.y += node.vy;
      if (node.x < 0 || node.x > window.innerWidth) node.vx *= -1;
      if (node.y < 0 || node.y > window.innerHeight) node.vy *= -1;
      context.beginPath();
      context.arc(node.x, node.y, 1.2, 0, Math.PI * 2);
      context.fill();
      for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
        const other = nodes[otherIndex];
        if (Math.hypot(node.x - other.x, node.y - other.y) < 120) {
          context.beginPath();
          context.moveTo(node.x, node.y);
          context.lineTo(other.x, other.y);
          context.stroke();
        }
      }
    }
    if (!reduceMotion.matches) frame = requestAnimationFrame(draw);
  };

  resize();
  draw();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pointermove', (event) => { pointer = { x: event.clientX, y: event.clientY }; }, { passive: true });
  reduceMotion.addEventListener('change', () => {
    cancelAnimationFrame(frame);
    draw();
  });
}

function initMotion() {
  const heroMedia = document.querySelector('[data-parallax]');
  const header = document.querySelector('[data-header]');
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    header.classList.toggle('is-scrolled', scrollY > 30);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && scrollY < window.innerHeight) {
      heroMedia.style.transform = `scale(1.04) translate3d(0, ${scrollY * 0.08}px, 0)`;
    }
  }, { passive: true });

  if (!window.matchMedia('(hover: hover)').matches) return;
  document.querySelectorAll('[data-tilt]').forEach((panel) => {
    panel.addEventListener('pointermove', (event) => {
      const rect = panel.getBoundingClientRect();
      const rotateY = ((event.clientX - rect.left) / rect.width - 0.5) * 3;
      const rotateX = ((event.clientY - rect.top) / rect.height - 0.5) * -3;
      panel.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });
    panel.addEventListener('pointerleave', () => { panel.style.transform = ''; });
  });
}

function handleDocumentClick(event) {
  const post = event.target.closest('[data-post-id]');
  if (post) return openArticle(Number(post.dataset.postId));
  const project = event.target.closest('[data-project]');
  if (project) return openProject(project.dataset.project);
  const edit = event.target.closest('[data-edit-post]');
  if (edit) return openEditor(Number(edit.dataset.editPost));
  const remove = event.target.closest('[data-remove-image]');
  if (remove) {
    state.editorImages.splice(Number(remove.dataset.removeImage), 1);
    return renderImagePreview();
  }
  const deletion = event.target.closest('[data-delete-post]');
  if (deletion) return deletePost(Number(deletion.dataset.deletePost));
}

function bindEvents() {
  document.addEventListener('click', handleDocumentClick);
  document.querySelectorAll('[data-open-editor]').forEach((button) => button.addEventListener('click', () => openEditor()));
  document.querySelectorAll('[data-open-activity]').forEach((button) => button.addEventListener('click', () => {
    renderActivity();
    openDialog(document.getElementById('activityDialog'));
  }));
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog(dialog);
  }));
  document.getElementById('themeToggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  document.getElementById('authForm').addEventListener('submit', verifyAdmin);
  document.getElementById('editorForm').addEventListener('submit', submitEditor);
  document.getElementById('postImages').addEventListener('change', (event) => addSelectedImages(event.target.files));
  document.getElementById('closeViewer').addEventListener('click', closeProject);
  document.getElementById('clearActivity').addEventListener('click', () => {
    safeStorageSet(localStorage, ACTIVITY_KEY, '[]');
    renderActivity();
    toast('本机活动记录已清空');
  });
  document.getElementById('postList').addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-post-id]')) {
      event.preventDefault();
      openArticle(Number(event.target.dataset.postId));
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('projectViewer').classList.contains('is-open')) closeProject();
  });
}

function init() {
  initTheme();
  icons();
  bindEvents();
  observeReveals();
  initCursor();
  initCanvas();
  initMotion();
  recordActivity('进入首页');
  loadPosts();
  loadDongchediPreview();
}

init();
