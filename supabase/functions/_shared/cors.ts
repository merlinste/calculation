export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export function withCors(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers ?? {});
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return { ...init, headers };
}
