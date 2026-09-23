import { NextResponse } from "next/server";
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

    const { merchantSlug, email } = parsed.data;

    try {
      const { card, merchant, existing } = await enrollCustomer(merchantSlug, email);

      // Los dos passes se ofrecen siempre que se pueda: el cliente puede
      // cambiar de teléfono o agregarla desde otro dispositivo. Son
      // independientes: si uno falla, el otro sigue.
      const [saveUrl, pkpassUrl] = await Promise.all([
        issueGooglePass(card, merchant, email),
        applePassUrlFor(card.id),
      ]);

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
