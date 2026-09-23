import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAppleWalletConfigured, isGoogleWalletConfigured } from "@/lib/env";
import { updateLoyaltyObject } from "@/lib/wallet/google";
import { pushPassUpdates } from "@/lib/wallet/apple/apns";
import { toMerchant, MERCHANT_COLS } from "@/lib/services/enrollment";
import {
  activePushTokensFor,
  deactivatePushTokens,
} from "@/lib/services/apple-registrations";
import type { Card } from "@/lib/domain/card";

/**
 * Propaga el estado de una tarjeta a los passes de wallet del cliente.
 *
 * Los passes son proyecciones de solo lectura del backend (SPEC §2): cada vez
 * que cambia una card hay que avisarle a cada wallet.
 *
 * - Google: PATCH del objeto; Google lo empuja al teléfono.
 * - Apple: push vacío a cada dispositivo registrado; el iPhone vuelve a pedir
 *   el pass a nuestro web service. (El RPC de sellado ya actualizó
 *   `apple_updated_at`, que es lo que le dice al iPhone que hay versión nueva.)
 *
 * Contrato: **nunca lanza**. Un fallo de push no puede tumbar un sellado que ya
 * quedó registrado en la base. Las dos wallets son independientes.
 */
export async function notifyWallets(card: Card): Promise<void> {
  await Promise.all([notifyGoogle(card), notifyApple(card)]);
}

async function notifyGoogle(card: Card): Promise<void> {
  if (!card.googleObjectId || !isGoogleWalletConfigured()) return;

  try {
    const db = createAdminClient();
    const { data: merchantRow } = await db
      .from("merchants")
      .select(MERCHANT_COLS)
      .eq("id", card.merchantId)
      .single();

    if (!merchantRow) return;

    await updateLoyaltyObject(card, toMerchant(merchantRow));
  } catch (error) {
    console.error("[wallet-sync] no se pudo actualizar el pass de Google:", error);
  }
}

async function notifyApple(card: Card): Promise<void> {
  if (!isAppleWalletConfigured()) return;

  try {
    const tokens = await activePushTokensFor(card.id);
    if (tokens.length === 0) return;

    const { gone } = await pushPassUpdates(tokens);
    await deactivatePushTokens(gone);
  } catch (error) {
    console.error("[wallet-sync] no se pudo avisar a Apple:", error);
  }
}
