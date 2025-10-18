// Create a client that forwards the end-user's JWT (RLS greift!)
import { createClient } from "@supabase/supabase-js";

export function makeClient(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } }
  });
}
