import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/api/response";

/** IP del cliente detrás del proxy de Vercel. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Consume una unidad del bucket. Lanza 429 si se pasó del límite.
 * Si la base falla, deja pasar: no queremos que un problema del rate limiter
 * bloquee altas reales en el mostrador.
 */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("[rate-limit] falló, se deja pasar:", error.message);
    return;
  }

  if (data === false) {
    throw new HttpError(
      429,
      "RATE_LIMITED",
      "Demasiados intentos. Esperá un rato y probá de nuevo.",
    );
  }
}
