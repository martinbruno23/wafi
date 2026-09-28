import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGoogleWalletConfigured } from "@/lib/env";
import {
  ensureLoyaltyClass,
  createLoyaltyObject,
  buildSaveUrl,
  classIdFor,
} from "@/lib/wallet/google";
import type { Card, Merchant } from "@/lib/domain/card";

/**
 * Emite el pass de Google Wallet de una tarjeta y devuelve el link para
 * guardarlo. Idempotente: si el objeto ya existe, regenera el save link
 * (re-agregar un pass borrado es un caso válido — SPEC §5.2).
 *
 * Devuelve null si Google Wallet no está configurado; el alta no se cae por eso.
 */
export async function issueGooglePass(
  card: Card,
  merchant: Merchant,
  customerEmail: string,
): Promise<string | null> {
  if (!isGoogleWalletConfigured()) return null;

  const db = createAdminClient();

  try {
    // La clase del comercio se crea una sola vez, en el primer alta. Si el
    // comercio cambia su marca, se actualiza aparte (npm run wallet:sync-classes),
    // no en cada alta: son dos llamadas a Google que el cliente esperaría.
    if (!merchant.googleClassId) {
      const classId = await ensureLoyaltyClass(merchant);
      await db
        .from("merchants")
        .update({ google_class_id: classId })
        .eq("id", merchant.id);
    }

    // El objeto se crea una vez por tarjeta. Si ya existe (re-agregar un pass
    // borrado), alcanza con volver a firmar el link.
    let objectId = card.googleObjectId;
    if (!objectId) {
      objectId = await createLoyaltyObject(card, merchant, { email: customerEmail });
      await db
        .from("cards")
        .update({ google_object_id: objectId })
        .eq("id", card.id);
    }

    return buildSaveUrl(objectId);
  } catch (error) {
    // Un fallo de Google no debe impedir el alta: la tarjeta ya existe en
    // nuestra base y el cliente puede reintentar agregarla después.
    console.error("[google-wallet] no se pudo emitir el pass:", error);
    return null;
  }
}

export { classIdFor };
