function isPublicIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const value = ip.trim();
  const ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

  if (ipv4) {
    const parts = ipv4.slice(1).map((part) => Number(part));
    if (parts.some((part) => part < 0 || part > 255)) return false;
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return false;
    if (parts[0] === 169 && parts[1] === 254) return false;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;
    return true;
  }

  const lower = value.toLowerCase();
  if (lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) {
    return false;
  }

  return lower.includes(':');
}

function getClientIp(request) {
  const candidates = [
    request.headers.get('CF-Connecting-IP'),
    request.headers.get('True-Client-IP'),
    (request.headers.get('X-Forwarded-For') || '').split(',')[0],
  ];

  return candidates.find(isPublicIp) || '';
}

function json(data, init) {
  const headers = new Headers(init && init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), {
    status: (init && init.status) || 200,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/visitor-ip') {
      const ip = getClientIp(request);
      return json({
        ip: ip || null,
        source: ip ? 'cloudflare' : 'unavailable',
      });
    }

    return env.ASSETS.fetch(request);
  },
};
