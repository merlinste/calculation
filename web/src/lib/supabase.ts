import { createClient } from "@supabase/supabase-js";

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

const supabaseUrl = stripTrailingSlashes(import.meta.env.VITE_SUPABASE_URL!);

export const supabase = createClient(supabaseUrl, import.meta.env.VITE_SUPABASE_ANON_KEY!);

const configuredFunctionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

export const functionsUrl =
  configuredFunctionsUrl && configuredFunctionsUrl.trim().length
    ? stripTrailingSlashes(configuredFunctionsUrl)
    : `${supabaseUrl}/functions/v1`;
