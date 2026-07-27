import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/api/response";
import { hasPrize, type Card } from "@/lib/domain/card";
import { toCard } from "@/lib/services/enrollment";
import { notifyWallets } from "@/lib/services/wallet-sync";
import type { MerchantSession } from "@/lib/auth/merchant";

export type CardActionResult = {
  card: Card;
  stampsRequired: number;
  hasPrize: boolean;
};

/**
 * Aplica un sellado o un canje sobre una tarjeta del comercio autenticado.
 *
 * La escritura la hace siempre el RPC correspondiente, que actualiza la card y
 * registra el stamp_event en la misma transacción (SPEC §6). Después se
 * propaga el cambio a los passes de wallet.
 */
export async function applyCardAction(
  cardId: string,
  action: "stamp" | "redeem",
  session: MerchantSession,
): Promise<CardActionResult> {
  const db = createAdminClient();

  // La tarjeta tiene que ser de este comercio.
  const { data: cardRow, error: cardError } = await db
    .from("cards")
    .select("id, merchant_id")
    .eq("id", cardId)
    .maybeSingle();

  if (cardError) throw new HttpError(500, "DB_ERROR", cardError.message);
  if (!cardRow) {
    throw new HttpError(404, "CARD_NOT_FOUND", "No encontramos esta tarjeta.");
  }
  if (cardRow.merchant_id !== session.merchantId) {
    throw new HttpError(403, "WRONG_MERCHANT", "Esta tarjeta es de otro comercio.");
  }

  const { data, error } = await db.rpc(
    action === "stamp" ? "apply_stamp" : "apply_redeem",
    { p_card_id: cardId, p_created_by: session.userId },
  );

  if (error) {
    if (error.message.includes("NO_PRIZE")) {
      throw new HttpError(
        409,
        "NO_PRIZE",
        "Esta tarjeta todavía no llegó al premio.",
      );
    }
    if (error.message.includes("CARD_NOT_FOUND")) {
      throw new HttpError(404, "CARD_NOT_FOUND", "No encontramos esta tarjeta.");
    }
    throw new HttpError(500, "DB_ERROR", error.message);
  }

  // El RPC devuelve la fila de cards actualizada.
  const updated = Array.isArray(data) ? data[0] : data;
  const card = toCard(updated);

  const { data: merchantRow } = await db
    .from("merchants")
    .select("stamps_required")
    .eq("id", session.merchantId)
    .single();

  const stampsRequired = merchantRow?.stamps_required ?? 0;

  // Nunca debe tumbar la operación ya registrada.
  try {
    await notifyWallets(card);
  } catch (pushError) {
    console.error("[wallet-sync] fallo al actualizar passes:", pushError);
  }

  return {
    card,
    stampsRequired,
    hasPrize: hasPrize(card, { stampsRequired }),
  };
}
