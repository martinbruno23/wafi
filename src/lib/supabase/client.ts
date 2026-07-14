import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para el navegador (usa la anon key + RLS).
 * Se instancia por componente client que lo necesite.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
