import { NextResponse, after } from "next/server";
import { z } from "zod";
import { enrollCustomer, EnrollmentError } from "@/lib/services/enrollment";
import { issueGooglePass } from "@/lib/services/pass-issuance";
import { applePassUrlFor } from "@/lib/services/apple-pass";
import { handleRoute, HttpError } from "@/lib/api/response";
import { clientIp, enforceRateLimit } from "@/lib/api/rate-limit";

const bodySchema = z.object({
  merchantSlug: z.string().min(1),
  email: z.email(),
  platform: z.enum(["google", "apple", "unknown"]).default("unknown"),
});

/**
 * POST /api/enroll — público. Alta del cliente en un comercio (SPEC §5.2).
 * El email no se verifica acá: eso pasaría recién al entrar a /mi.
 *
 * Devuelve la card y, si la wallet está configurada, el link para guardarla:
 * `google.saveUrl` (Google Wallet) y `apple.pkpassUrl` (Apple Wallet).
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    await enforceRateLimit(`enroll:${clientIp(request)}`, 10, 3600);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new HttpError(
        400,
        "INVALID_BODY",
        "Revisá el email e intentá de nuevo.",
      );
    }

    const { merchantSlug, email, platform } = parsed.data;

    try {
      const { card, merchant, existing } = await enrollCustomer(merchantSlug, email);

      // El link de Apple es barato (una lectura). El de Google implica
      // llamadas a su API: solo se espera si el cliente está en Android.
      // Desde iPhone o desde una compu se emite igual, pero después de
      // responder (el cliente puede cambiar de teléfono más adelante).
      const pkpassUrl = await applePassUrlFor(card.id);
      let saveUrl: string | null = null;
      if (platform === "google") {
        saveUrl = await issueGooglePass(card, merchant, email);
      } else {
        after(() => issueGooglePass(card, merchant, email));
      }

      return NextResponse.json({
        cardId: card.id,
        existing,
        ...(saveUrl ? { google: { saveUrl } } : {}),
        ...(pkpassUrl ? { apple: { pkpassUrl } } : {}),
      });
    } catch (error) {
      if (error instanceof EnrollmentError) {
        if (error.code === "MERCHANT_NOT_FOUND") {
          throw new HttpError(404, error.code, "No encontramos este comercio.");
        }
        throw new HttpError(500, error.code, error.message);
      }
      throw error;
    }
  });
}
