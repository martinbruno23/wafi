import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, isAppleWalletConfigured } from "@/lib/env";
import { toCard, toMerchant, CARD_COLS, MERCHANT_COLS } from "@/lib/services/enrollment";
import { buildPkpass } from "@/lib/wallet/apple/pkpass";
import type { LastEvent } from "@/lib/wallet/apple/pass-content";
import type { Card, Merchant } from "@/lib/domain/card";

/** Todo lo que hace falta para (re)generar el pass de una tarjeta. */
export type ApplePassData = {
  card: Card;
  merchant: Merchant;
  authToken: string;
  /** Última modificación del pass: la usa iOS para saber si tiene que bajarlo. */
  updatedAt: Date;
  lastEvent: LastEvent;
  location: { lat: number; lng: number } | null;
};

/** Compara tokens en tiempo constante (evita ataques por timing). */
export function tokensMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function loadApplePassData(cardId: string): Promise<ApplePassData | null> {
  const db = createAdminClient();

  const { data: cardRow } = await db
    .from("cards")
    .select(`${CARD_COLS}, apple_auth_token, apple_updated_at`)
    .eq("id", cardId)
    .maybeSingle();
  if (!cardRow) return null;

  const [{ data: merchantRow }, { data: lastEventRow }] = await Promise.all([
    db
      .from("merchants")
      .select(`${MERCHANT_COLS}, lat, lng`)
      .eq("id", cardRow.merchant_id)
      .single(),
    db
      .from("stamp_events")
      .select("type")
      .eq("card_id", cardId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!merchantRow) return null;

  const lastType = lastEventRow?.type;
  return {
    card: toCard(cardRow),
    merchant: toMerchant(merchantRow),
    authToken: cardRow.apple_auth_token as string,
    updatedAt: new Date(cardRow.apple_updated_at as string),
    lastEvent: lastType === "stamp" || lastType === "redeem" ? lastType : null,
    location:
      merchantRow.lat != null && merchantRow.lng != null
        ? { lat: Number(merchantRow.lat), lng: Number(merchantRow.lng) }
        : null,
  };
}

export function renderApplePass(data: ApplePassData): Promise<Buffer> {
  return buildPkpass({
    card: data.card,
    merchant: data.merchant,
    authToken: data.authToken,
    lastEvent: data.lastEvent,
    location: data.location,
  });
}

/**
 * Link de descarga del pass para la landing de alta. Lleva el token de la
 * tarjeta: sin él, cualquiera que adivine un cardId podría bajar el pass (y con
 * él, el QR). Devuelve null si Apple Wallet no está configurado.
 */
export async function applePassUrlFor(cardId: string): Promise<string | null> {
  if (!isAppleWalletConfigured()) return null;

  const db = createAdminClient();
  const { data } = await db
    .from("cards")
    .select("apple_auth_token")
    .eq("id", cardId)
    .single();
  if (!data) return null;

  return `${env.appUrl}/api/passes/apple/${cardId}?t=${data.apple_auth_token}`;
}
