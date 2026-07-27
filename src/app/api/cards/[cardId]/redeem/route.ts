import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/merchant";
import { applyCardAction } from "@/lib/services/card-actions";
import { handleRoute } from "@/lib/api/response";

/**
 * POST /api/cards/[cardId]/redeem — autenticado como comercio.
 * Canjea el premio: descuenta los sellos requeridos. 409 si no alcanza.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  return handleRoute(async () => {
    const session = await requireMerchantSession();
    const { cardId } = await params;

    const result = await applyCardAction(cardId, "redeem", session);

    return NextResponse.json({
      currentStamps: result.card.currentStamps,
      stampsRequired: result.stampsRequired,
      prizesRedeemed: result.card.prizesRedeemed,
      hasPrize: result.hasPrize,
    });
  });
}
