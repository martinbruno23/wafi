import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMerchantSession } from "@/lib/auth/merchant";
import { handleRoute, HttpError } from "@/lib/api/response";
import { toScanState } from "@/lib/domain/card";
import { toCard, toMerchant } from "@/lib/services/enrollment";

/**
 * GET /api/scan/[qrToken] — autenticado como comercio.
 * Lo llama el scanner al leer el QR del pass del cliente.
 *
 * Valida que la tarjeta sea de ESTE comercio: es el anti-fraude estructural
 * del SPEC §4 (un café no puede tocar tarjetas de otro).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ qrToken: string }> },
) {
  return handleRoute(async () => {
    const session = await requireMerchantSession();
    const { qrToken } = await params;
    const db = createAdminClient();

    const { data: cardRow, error } = await db
      .from("cards")
      .select(
        "id, customer_id, merchant_id, qr_token, current_stamps, total_stamps, prizes_redeemed",
      )
      .eq("qr_token", qrToken)
      .maybeSingle();

    if (error) throw new HttpError(500, "DB_ERROR", error.message);
    if (!cardRow) {
      throw new HttpError(404, "CARD_NOT_FOUND", "QR no reconocido.");
    }
    if (cardRow.merchant_id !== session.merchantId) {
      throw new HttpError(
        403,
        "WRONG_MERCHANT",
        "Esta tarjeta es de otro comercio.",
      );
    }

    const [{ data: merchantRow }, { data: customerRow }] = await Promise.all([
      db
        .from("merchants")
        .select(
          "id, slug, name, brand_color, stamps_required, prize_description, logo_url, is_active",
        )
        .eq("id", cardRow.merchant_id)
        .single(),
      db.from("customers").select("id, email").eq("id", cardRow.customer_id).single(),
    ]);

    if (!merchantRow || !customerRow) {
      throw new HttpError(500, "DB_ERROR", "No pudimos leer la tarjeta completa.");
    }

    return NextResponse.json(
      toScanState(toCard(cardRow), toMerchant(merchantRow), {
        id: customerRow.id,
        email: customerRow.email,
      }),
    );
  });
}
