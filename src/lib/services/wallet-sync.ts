import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGoogleWalletConfigured } from "@/lib/env";
import { updateLoyaltyObject } from "@/lib/wallet/google";
import { toMerchant, MERCHANT_COLS } from "@/lib/services/enrollment";
import type { Card } from "@/lib/domain/card";

/**
 * Propaga el estado de una tarjeta a los passes de wallet del cliente.
 *
 * Los passes son proyecciones de solo lectura del backend (SPEC §2): cada vez
 * que cambia una card hay que pushear la actualización. Google se encarga de
 * empujarla al teléfono; solo hace falta el PATCH del objeto.
 *
 * Apple (APNs a cada device registrado) se suma en la Etapa 4.
 *
 * Contrato: **nunca lanza**. Un fallo de push no puede tumbar un sellado que ya
 * quedó registrado en la base.
 */
export async function notifyWallets(card: Card): Promise<void> {
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
