export const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://earlybird-calculation.netlify.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '600',
  'Vary': 'Origin'
} as const;

export function withCors(req: Request, init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers ?? {});
  const origin = req.headers.get('Origin');

  for (const [key, value] of Object.entries(corsHeaders)) {
    if (headers.has(key)) {
      if (key === 'Vary' && !headers.get(key)?.split(',').map((s) => s.trim()).includes('Origin')) {
        headers.append(key, 'Origin');
      }
      continue;
    }

    if (key === 'Access-Control-Allow-Origin') {
      if (origin && value === '*') {
        headers.set(key, origin);
      } else {
        headers.set(key, value);
      }
      continue;
    }

    headers.set(key, value);
  }

  return { ...init, headers };
}
