const DONGCHEDI_ORIGIN = 'https://www.dongchedi.com';
const DONGCHEDI_CACHE_KEY = 'dongchedi:profile-snapshot:v1';
const DONGCHEDI_REQUEST_TIMEOUT_MS = 12_000;
const DONGCHEDI_STALE_AFTER_MS = 36 * 60 * 60 * 1_000;
const DONGCHEDI_MAX_PAGES = 20;
const DONGCHEDI_MAX_POSTS = 2_000;

const SUPABASE_URL = 'https://szbgotjjhurfxhyktbus.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_swGyzcP9s0tTZwf0vgF5cw_5h5VV2ww';
const SUPABASE_KEEPALIVE_TIMEOUT_MS = 10_000;

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co",
    "font-src 'self'",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

function secureHeaders(headers = new Headers()) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  return headers;
}

function json(data, init = {}) {
  const headers = secureHeaders(new Headers(init.headers));
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  return new Response(init.head ? null : JSON.stringify(data), {
    status: init.status || 200,
    headers,
  });
}

function textValue(value, maxLength = 12_000) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function countValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function isoFromUnixSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const date = new Date(seconds * 1_000);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function safeHttpsUrl(value, allowedHostSuffixes) {
  if (!value) return '';
  try {
    const parsed = new URL(String(value));
    if (parsed.protocol !== 'https:') return '';
    const hostname = parsed.hostname.toLowerCase();
    const allowed = allowedHostSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
    return allowed ? parsed.href : '';
  } catch {
    return '';
  }
}

function safeMediaUrl(value) {
  return safeHttpsUrl(value, ['byteimg.com', 'dcarimg.com', 'byteacctimg.com']);
}

function safeDongchediUrl(value, fallbackId = '') {
  const safe = safeHttpsUrl(value, ['dcdapp.com', 'dongchedi.com']);
  if (safe) return safe;
  return fallbackId
    ? `${DONGCHEDI_ORIGIN}/ugc/article/${encodeURIComponent(fallbackId)}`
    : DONGCHEDI_ORIGIN;
}

function normalizeDongchediImage(image, fallbackUrl, title) {
  const rawUrl = image && typeof image === 'object' ? image.image_url : fallbackUrl;
  const url = safeMediaUrl(rawUrl);
  if (!url) return null;
  return {
    url,
    width: countValue(image && image.width),
    height: countValue(image && image.height),
    alt: textValue((image && image.desc) || title, 180),
  };
}

export function normalizeDongchediPost(item) {
  if (!item || typeof item !== 'object') return null;
  const id = textValue(item.gid_str || item.gid || item.id, 80);
  if (!id) return null;

  const content = textValue(item.content || item.title, 16_000);
  const title = textValue(item.thread_title || item.title || content, 320) || '未命名动态';
  const detailImages = Array.isArray(item.detail_image_list) ? item.detail_image_list : [];
  const fallbackImages = Array.isArray(item.image_list) ? item.image_list : [];
  const images = [];

  for (let index = 0; index < Math.max(detailImages.length, fallbackImages.length); index += 1) {
    const image = normalizeDongchediImage(detailImages[index], fallbackImages[index], title);
    if (image) images.push(image);
  }

  const videoInfo = item.video_detail_info && typeof item.video_detail_info === 'object'
    ? item.video_detail_info
    : {};
  const videoCoverUrl = safeMediaUrl(videoInfo.video_cover_url);
  const video = item.has_video && (videoInfo.video_id || videoCoverUrl) ? {
    id: textValue(videoInfo.video_id, 160),
    coverUrl: videoCoverUrl,
    durationSeconds: countValue(videoInfo.video_duration),
    watchCount: countValue(videoInfo.video_watch_count),
  } : null;
  const discussLabel = item.discuss_label && typeof item.discuss_label === 'object' ? item.discuss_label : {};
  const activityInfo = item.activity_info && typeof item.activity_info === 'object' ? item.activity_info : {};
  const shareInfo = item.share_info && typeof item.share_info === 'object' ? item.share_info : {};

  return {
    id,
    title,
    content,
    publishedAt: isoFromUnixSeconds(item.display_time || item.behot_time || item.create_time),
    type: textValue(item.article_type_str || 'post', 80),
    topic: textValue(discussLabel.name || activityInfo.name, 120),
    activity: textValue(activityInfo.name, 120),
    sourceUrl: safeDongchediUrl(shareInfo.share_url, id),
    metrics: {
      reads: countValue(item.read_count),
      likes: countValue(item.digg_count),
      comments: countValue(item.comment_count),
      collects: countValue(item.collect_count),
      shares: countValue(item.share_count),
    },
    images,
    video,
  };
}

function counterValue(info, type, title) {
  const counters = info && Array.isArray(info.counters) ? info.counters : [];
  const match = counters.find((counter) => counter && (counter.type === type || counter.title === title));
  return countValue(match && match.count);
}

export function normalizeDongchediProfile(data, userId) {
  const info = data && data.info && typeof data.info === 'object' ? data.info : {};
  const medals = Array.isArray(info.medal_list)
    ? info.medal_list.map((medal) => textValue(medal && medal.title, 80)).filter(Boolean).slice(0, 8)
    : [];
  return {
    id: textValue(info.user_id_str || info.user_id || userId, 80),
    name: textValue(info.nick_name, 120) || '我要娶一个旅行车',
    bio: textValue(info.desc, 500),
    avatarUrl: safeMediaUrl(info.avatar_url),
    coverUrl: safeMediaUrl(info.background_img_url),
    followers: countValue(info.fans_num) || counterValue(info, 1, '粉丝'),
    following: countValue(info.following_num) || counterValue(info, 2, '关注'),
    likes: counterValue(info, 3, '获赞'),
    medals,
  };
}

async function fetchDongchediJson(pathname, params) {
  const url = new URL(pathname, DONGCHEDI_ORIGIN);
  url.search = new URLSearchParams({
    ...params,
    aid: '1839',
    app_name: 'auto_web_pc',
  }).toString();
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: `${DONGCHEDI_ORIGIN}/`,
      'User-Agent': 'Mozilla/5.0 (compatible; SW-nb profile mirror; +https://www.dongchedi.com/)',
    },
    signal: AbortSignal.timeout(DONGCHEDI_REQUEST_TIMEOUT_MS),
  });
  const contentType = response.headers.get('Content-Type') || '';
  if (!response.ok || !contentType.toLowerCase().includes('application/json')) {
    throw new Error(`Dongchedi upstream returned ${response.status}`);
  }
  const payload = await response.json();
  if (!payload || payload.status !== 0 || !payload.data) {
    throw new Error(textValue(payload && (payload.prompts || payload.message), 240) || 'Dongchedi payload is invalid');
  }
  return payload.data;
}

export async function fetchAllDongchediPosts(userId) {
  const posts = [];
  const seenIds = new Set();
  const seenCursors = new Set(['0']);
  let cursor = '0';
  let pageCount = 0;
  let hasMore = true;
  let exhausted = false;

  while (hasMore && pageCount < DONGCHEDI_MAX_PAGES && posts.length < DONGCHEDI_MAX_POSTS) {
    const data = await fetchDongchediJson('/motor/pc/user/profile/all_info', {
      user_id: '',
      profile_user_id: userId,
      count: '40',
      cursor,
      enterName: 'all_info',
    });
    const items = Array.isArray(data.data) ? data.data : [];
    pageCount += 1;

    for (const item of items) {
      const post = normalizeDongchediPost(item);
      if (!post || seenIds.has(post.id)) continue;
      seenIds.add(post.id);
      posts.push(post);
      if (posts.length >= DONGCHEDI_MAX_POSTS) break;
    }

    hasMore = Boolean(data.has_more);
    const nextCursor = textValue(data.max_cursor, 80);
    if (!hasMore || items.length === 0) {
      exhausted = true;
      break;
    }
    if (!nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return {
    posts,
    pages: pageCount,
    exhausted,
    truncated: !exhausted && hasMore,
  };
}

export async function fetchDongchediSnapshot(userId) {
  const [profileData, postResult] = await Promise.all([
    fetchDongchediJson('/motor/pc/user/profile/user_info', {
      user_id: '',
      profile_user_id: userId,
    }),
    fetchAllDongchediPosts(userId),
  ]);
  const refreshedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    userId,
    sourceUrl: `${DONGCHEDI_ORIGIN}/user/${encodeURIComponent(userId)}`,
    refreshedAt,
    profile: normalizeDongchediProfile(profileData, userId),
    posts: postResult.posts,
    sync: {
      source: 'dongchedi-public-profile',
      cadence: 'daily',
      pagesFetched: postResult.pages,
      sourceExhausted: postResult.exhausted,
      truncated: postResult.truncated,
    },
  };
}

async function readDongchediCache(env) {
  try {
    return await env.DONGCHEDI_CACHE.get(DONGCHEDI_CACHE_KEY, 'json');
  } catch (error) {
    console.error(JSON.stringify({
      message: 'dongchedi cache read failed',
      error: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

export async function pingSupabase() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=id&limit=1`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(SUPABASE_KEEPALIVE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`supabase keepalive returned ${response.status}`);
  return { status: 'ok', upstreamStatus: response.status };
}

export async function refreshDongchediCache(env) {
  const userId = textValue(env.DONGCHEDI_USER_ID, 80) || '485359118462679';
  const snapshot = await fetchDongchediSnapshot(userId);
  await env.DONGCHEDI_CACHE.put(DONGCHEDI_CACHE_KEY, JSON.stringify(snapshot), {
    metadata: {
      refreshedAt: snapshot.refreshedAt,
      postCount: snapshot.posts.length,
      schemaVersion: snapshot.schemaVersion,
    },
  });
  return snapshot;
}

function snapshotAge(snapshot) {
  const timestamp = snapshot && Date.parse(snapshot.refreshedAt);
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Date.now() - timestamp);
}

function snapshotResponse(request, snapshot, cacheStatus) {
  const age = snapshotAge(snapshot);
  const responseBody = {
    ...snapshot,
    cache: {
      status: cacheStatus,
      ageSeconds: Number.isFinite(age) ? Math.floor(age / 1_000) : null,
    },
  };
  const etag = `W/"dcd-${encodeURIComponent(snapshot.refreshedAt || 'unknown')}-${snapshot.posts.length}"`;
  const headers = new Headers({
    'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    ETag: etag,
    'X-Data-Stale': cacheStatus === 'stale' ? '1' : '0',
  });
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers: secureHeaders(headers) });
  }
  return json(responseBody, { headers, head: request.method === 'HEAD' });
}

async function handleDongchediProfile(request, env, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'Method not allowed' }, {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const cached = await readDongchediCache(env);
  if (cached && Array.isArray(cached.posts) && cached.profile) {
    const stale = snapshotAge(cached) > DONGCHEDI_STALE_AFTER_MS;
    if (stale) {
      ctx.waitUntil(refreshDongchediCache(env).catch((error) => {
        console.error(JSON.stringify({
          message: 'dongchedi background refresh failed',
          error: error instanceof Error ? error.message : String(error),
        }));
      }));
    }
    return snapshotResponse(request, cached, stale ? 'stale' : 'fresh');
  }

  try {
    const snapshot = await refreshDongchediCache(env);
    return snapshotResponse(request, snapshot, 'refreshed');
  } catch (error) {
    console.error(JSON.stringify({
      message: 'dongchedi initial refresh failed',
      error: error instanceof Error ? error.message : String(error),
    }));
    return json({
      error: '懂车帝内容暂时无法同步，请稍后重试。',
      sourceUrl: `${DONGCHEDI_ORIGIN}/user/${encodeURIComponent(env.DONGCHEDI_USER_ID || '485359118462679')}`,
    }, { status: 502 });
  }
}

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  secureHeaders(secured.headers);
  return secured;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, { status: 405 });
      return json({ status: 'ok', version: 3 });
    }
    if (url.pathname === '/api/dongchedi-profile') {
      return handleDongchediProfile(request, env, ctx);
    }
    if (url.pathname === '/__scheduled') return withSecurityHeaders(new Response('Not Found', { status: 404 }));
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },

  async scheduled(controller, env, ctx) {
    const startedAt = Date.now();
    const isDaily = controller.cron === '17 20 * * *';

    if (isDaily) {
      const job = refreshDongchediCache(env).then((snapshot) => {
        console.log(JSON.stringify({
          message: 'dongchedi daily refresh completed',
          cron: controller.cron,
          scheduledTime: controller.scheduledTime,
          durationMs: Date.now() - startedAt,
          postCount: snapshot.posts.length,
        }));
      }).catch((error) => {
        console.error(JSON.stringify({
          message: 'dongchedi daily refresh failed',
          cron: controller.cron,
          scheduledTime: controller.scheduledTime,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        }));
        throw error;
      });
      ctx.waitUntil(job);
    }

    const keepalive = pingSupabase().then((result) => {
      console.log(JSON.stringify({
        message: 'supabase keepalive completed',
        cron: controller.cron,
        scheduledTime: controller.scheduledTime,
        durationMs: Date.now() - startedAt,
        upstreamStatus: result.upstreamStatus,
      }));
    }).catch((error) => {
      console.error(JSON.stringify({
        message: 'supabase keepalive failed',
        cron: controller.cron,
        scheduledTime: controller.scheduledTime,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      }));
    });
    ctx.waitUntil(keepalive);
  },
};
