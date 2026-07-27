import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/api/response";

export type MerchantSession = {
  userId: string;
  merchantId: string;
};

/**
 * Resuelve la sesión del comercio para los endpoints del dashboard.
 * Todo sellado/canje exige pasar por acá: es lo que garantiza que los sellos
 * los escribe siempre un comercio autenticado (SPEC §10).
 *
 * Lanza 401 si no hay sesión, 403 si el usuario no pertenece a ningún comercio.
 */
export async function requireMerchantSession(): Promise<MerchantSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new HttpError(401, "UNAUTHENTICATED", "Iniciá sesión para continuar.");
  }

  // Con el cliente admin: la membresía es la que habilita RLS, leerla con la
  // sesión del usuario sería circular.
  const admin = createAdminClient();
  const { data: membership, error } = await admin
    .from("merchant_users")
    .select("merchant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "DB_ERROR", error.message);
  }
  if (!membership) {
    throw new HttpError(
      403,
      "NO_MERCHANT",
      "Tu usuario no está asociado a ningún comercio.",
    );
  }

  return { userId: user.id, merchantId: membership.merchant_id as string };
}
