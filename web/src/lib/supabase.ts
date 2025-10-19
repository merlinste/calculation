import { createClient } from "@supabase/supabase-js";

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

const supabaseUrl = stripTrailingSlashes(import.meta.env.VITE_SUPABASE_URL!);
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const configuredFunctionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

export const functionsUrl =
  configuredFunctionsUrl && configuredFunctionsUrl.trim().length
    ? stripTrailingSlashes(configuredFunctionsUrl)
    : `${supabaseUrl}/functions/v1`;
