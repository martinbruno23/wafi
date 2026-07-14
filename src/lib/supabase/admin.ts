import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase con la service_role key: bypassa RLS. SOLO server.
 * El import "server-only" hace fallar el build si se importa desde el cliente.
 * Lo usan los route handlers de negocio (enroll, stamp, redeem, wallets).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
