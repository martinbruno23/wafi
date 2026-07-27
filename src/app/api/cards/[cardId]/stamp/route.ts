import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/merchant";
import { applyCardAction } from "@/lib/services/card-actions";
import { handleRoute } from "@/lib/api/response";

/** POST /api/cards/[cardId]/stamp — autenticado como comercio. Suma un sello. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  return handleRoute(async () => {
    const session = await requireMerchantSession();
    const { cardId } = await params;

    const result = await applyCardAction(cardId, "stamp", session);

    return NextResponse.json({
      currentStamps: result.card.currentStamps,
      stampsRequired: result.stampsRequired,
      hasPrize: result.hasPrize,
    });
  });
}
