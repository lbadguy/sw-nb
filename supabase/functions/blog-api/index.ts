const DEFAULT_BODY_LIMIT = 6 * 1024 * 1024;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function allowedOrigin(req: Request): string {
  const origin = req.headers.get('origin') || '';
  const siteOrigin = Deno.env.get('SITE_ORIGIN') || '';
  if (origin && origin === siteOrigin) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return siteOrigin;
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = allowedOrigin(req);
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function getRoute(req: Request): string {
  const pathname = new URL(req.url).pathname;
  const marker = '/blog-api';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

function clientAddress(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || (req.headers.get('x-forwarded-for') || '').split(',')[0]
    || 'unknown'
  ).trim().slice(0, 128);
}

function consumeRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > DEFAULT_BODY_LIMIT) throw new Error('payload_too_large');
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > DEFAULT_BODY_LIMIT) {
    throw new Error('payload_too_large');
  }
  if (!text) return {};
  const value = JSON.parse(text);
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringField(body: Record<string, unknown>, key: string, maxLength = 1000): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function numberField(body: Record<string, unknown>, key: string): number {
  const value = Number(body[key]);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('invalid_input');
  return value;
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyAdminPassword(password: string): Promise<boolean> {
  const expectedHash = Deno.env.get('ADMIN_PASSWORD_SHA256') || '';
  if (!password || !expectedHash) return false;
  return timingSafeEqual(await sha256(password), expectedHash.toLowerCase());
}

async function viewerFingerprint(req: Request): Promise<string> {
  const secret = Deno.env.get('VIEW_HASH_SECRET');
  if (!secret) throw new Error('missing_server_secret');
  const source = `${clientAddress(req)}|${req.headers.get('user-agent') || 'unknown'}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(source));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function callRpc(functionName: string, args: Record<string, unknown>): Promise<unknown> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) throw new Error('missing_server_secret');

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(response.status === 404 ? 'not_found' : 'database_error');
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function validatePost(body: Record<string, unknown>) {
  const title = stringField(body, 'title', 180);
  const content = stringField(body, 'content', 30000);
  if (!title || !content) throw new Error('invalid_input');
  return {
    title,
    topic: stringField(body, 'topic', 80) || '#日常分享',
    snippet: stringField(body, 'snippet', 260),
    content,
    time_str: stringField(body, 'time_str', 64) || new Date().toISOString(),
    images: stringField(body, 'images', DEFAULT_BODY_LIMIT),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405);
  if (!allowedOrigin(req)) return json(req, { error: 'origin not allowed' }, 403);

  const route = getRoute(req);
  const address = clientAddress(req);

  try {
    const body = await readJson(req);

    if (route === '/posts/view') {
      if (!consumeRateLimit(`view:${address}`, 90, 60_000)) {
        return json(req, { error: 'too many requests' }, 429);
      }
      const data = await callRpc('increment_post_views_rpc', {
        target_post_id: numberField(body, 'target_post_id'),
        input_visitor_key: await viewerFingerprint(req),
      });
      return json(req, { data });
    }

    if (!consumeRateLimit(`admin:${address}`, 8, 5 * 60_000)) {
      return json(req, { error: 'too many attempts' }, 429);
    }

    const password = stringField(body, 'admin_password', 256);
    if (!await verifyAdminPassword(password)) {
      return json(req, route === '/admin/verify' ? { data: false } : { error: 'invalid credentials' }, 401);
    }
    if (route === '/admin/verify') return json(req, { data: true });

    if (route === '/posts/create') {
      return json(req, { data: await callRpc('create_post_rpc', validatePost(body)) });
    }

    if (route === '/posts/update') {
      const post = validatePost({
        title: body.next_title,
        topic: body.next_topic,
        snippet: body.next_snippet,
        content: body.next_content,
        images: body.next_images,
      });
      return json(req, {
        data: await callRpc('update_post_rpc', {
          target_post_id: numberField(body, 'target_post_id'),
          next_title: post.title,
          next_topic: post.topic,
          next_snippet: post.snippet,
          next_content: post.content,
          next_images: post.images,
        }),
      });
    }

    if (route === '/posts/delete') {
      return json(req, {
        data: await callRpc('delete_post_rpc', {
          target_post_id: numberField(body, 'target_post_id'),
        }),
      });
    }

    return json(req, { error: 'not found' }, 404);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'request_failed';
    const status = code === 'payload_too_large' ? 413 : code === 'invalid_input' ? 400 : code === 'not_found' ? 404 : 500;
    console.error('blog-api request failed', { route, code });
    return json(req, { error: status === 500 ? 'request failed' : code.replaceAll('_', ' ') }, status);
  }
});
