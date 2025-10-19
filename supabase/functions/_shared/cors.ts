const DEFAULT_ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";

function mergeVaryHeader(headers: Headers, value: string) {
  const current = headers.get("Vary");
  if (!current) {
    headers.set("Vary", value);
    return;
  }
  const parts = current.split(/\s*,\s*/);
  if (!parts.includes(value)) {
    headers.set("Vary", `${current}, ${value}`);
  }
}

export function withCors(req?: Request, init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers ?? {});

  const origin = req?.headers.get("Origin") ?? req?.headers.get("origin") ?? "*";
  const allowOrigin = origin === "null" || origin === "" ? "*" : origin;
  headers.set("Access-Control-Allow-Origin", allowOrigin);
  mergeVaryHeader(headers, "Origin");

  const requestedHeaders = req?.headers.get("Access-Control-Request-Headers");
  headers.set("Access-Control-Allow-Headers", requestedHeaders ?? DEFAULT_ALLOWED_HEADERS);
  if (requestedHeaders) {
    mergeVaryHeader(headers, "Access-Control-Request-Headers");
  }

  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  return { ...init, headers };
}
