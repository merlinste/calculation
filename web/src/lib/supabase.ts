import { createClient } from "@supabase/supabase-js";

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

const supabaseUrl = stripTrailingSlashes(import.meta.env.VITE_SUPABASE_URL!);
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const configuredFunctionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

const normalizeFunctionsUrl = (value: string | undefined | null): string => {
  if (!value) {
    return `${supabaseUrl}/functions/v1`;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return `${supabaseUrl}/functions/v1`;
  }

  try {
    const url = new URL(trimmed);
    const origin = `${url.protocol}//${url.host}`;
    const pathname = url.pathname.replace(/\/+$/, "");

    // Support the "project.supabase.co" URLs without having to manually append /functions/v1.
    if (!pathname || pathname === "/") {
      if (url.host.endsWith(".functions.supabase.co")) {
        return origin;
      }
      if (url.host.endsWith(".supabase.co")) {
        return `${origin}/functions/v1`;
      }
    }

    return `${origin}${pathname}`;
  } catch (error) {
    console.warn("Konnte Functions-URL nicht parsen, verwende Fallback", error);
    return stripTrailingSlashes(trimmed);
  }
};

export const functionsUrl = normalizeFunctionsUrl(configuredFunctionsUrl);
