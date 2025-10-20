import { createClient } from "@supabase/supabase-js";

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

const supabaseUrl = stripTrailingSlashes(import.meta.env.VITE_SUPABASE_URL!.trim());
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!.trim();
const configuredFunctionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

const inferDefaultFunctionsUrl = (): string => {
  try {
    const url = new URL(supabaseUrl);
    const supabaseHostMatch = url.host.match(/^(?<ref>[a-z0-9-]+)\.supabase\.(?<tld>co|in)$/);

    if (supabaseHostMatch?.groups) {
      const { ref, tld } = supabaseHostMatch.groups;
      return `${url.protocol}//${ref}.functions.supabase.${tld}`;
    }
  } catch (error) {
    console.warn("Konnte Supabase-URL nicht parsen, verwende generische Functions-Route", error);
  }

  return `${supabaseUrl}/functions/v1`;
};

const defaultFunctionsUrl = inferDefaultFunctionsUrl();

const normalizeFunctionsUrl = (value: string | undefined | null): string => {
  if (!value) {
    return defaultFunctionsUrl;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return defaultFunctionsUrl;
  }

  try {
    const url = new URL(trimmed);
    const origin = `${url.protocol}//${url.host}`;
    const pathname = url.pathname.replace(/\/+$/, "");

    if (!pathname || pathname === "/") {
      return origin;
    }

    return `${origin}${pathname}`;
  } catch (error) {
    console.warn("Konnte Functions-URL nicht parsen, verwende Fallback", error);
    return stripTrailingSlashes(trimmed);
  }
};

export const functionsUrl = normalizeFunctionsUrl(configuredFunctionsUrl);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  functions: { url: functionsUrl },
});
