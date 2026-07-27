import { NextResponse } from "next/server";
import { z } from "zod";
import { enrollCustomer, EnrollmentError } from "@/lib/services/enrollment";
import { issueGooglePass } from "@/lib/services/pass-issuance";
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
 * Los links de wallet (google.saveUrl / apple.pkpassUrl) se agregan en las
 * Etapas 2 y 4; por ahora devuelve la card creada.
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

      // El pass de Google se emite siempre que se pueda: el cliente puede
      // estar en Android o volver a agregarlo desde otro dispositivo.
      const saveUrl = await issueGooglePass(card, merchant, email);

      return NextResponse.json({
        cardId: card.id,
        existing,
        ...(saveUrl ? { google: { saveUrl } } : {}),
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
