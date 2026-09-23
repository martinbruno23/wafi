import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, isAppleWalletConfigured } from "@/lib/env";
import { loadApplePassData, tokensMatch, type ApplePassData } from "@/lib/services/apple-pass";
import {
  isValidSerial,
  parseApplePassAuth,
  type RegisteredPass,
} from "@/lib/wallet/apple/web-service";

/**
 * Autoriza un pedido del iPhone sobre un pass concreto. Devuelve los datos del
 * pass, o la respuesta HTTP que exige Apple si algo no cierra.
 *
 * Apple espera 401 ante un token inválido. Para no revelar qué tarjetas
 * existen, un serial desconocido también responde 401.
 */
export async function authorizeApplePass(
  request: Request,
  passTypeId: string,
  serial: string,
): Promise<{ data: ApplePassData } | { response: Response }> {
  if (!isAppleWalletConfigured() || passTypeId !== env.applePassTypeId) {
    return { response: new Response(null, { status: 404 }) };
  }

  const token = parseApplePassAuth(request.headers.get("authorization"));
  if (!token || !isValidSerial(serial)) {
    return { response: new Response(null, { status: 401 }) };
  }

  const data = await loadApplePassData(serial);
  if (!data || !tokensMatch(token, data.authToken)) {
    return { response: new Response(null, { status: 401 }) };
  }

  return { data };
}

/**
 * Registra (o reactiva) un dispositivo para recibir actualizaciones de un pass.
 * `created` → HTTP 201; `existing` → HTTP 200, según el contrato de Apple.
 */
export async function registerDevice(
  deviceId: string,
  cardId: string,
  pushToken: string,
): Promise<"created" | "existing"> {
  const db = createAdminClient();

  const { data: current } = await db
    .from("apple_registrations")
    .select("id, active, push_token")
    .eq("device_library_identifier", deviceId)
    .eq("card_id", cardId)
    .maybeSingle();

  if (current) {
    if (!current.active || current.push_token !== pushToken) {
      await db
        .from("apple_registrations")
        .update({ active: true, push_token: pushToken })
        .eq("id", current.id);
    }
    return current.active ? "existing" : "created";
  }

  const { error } = await db.from("apple_registrations").insert({
    device_library_identifier: deviceId,
    card_id: cardId,
    push_token: pushToken,
  });
  if (error) throw new Error(`No se pudo registrar el dispositivo: ${error.message}`);
  return "created";
}

/**
 * El usuario borró el pass del iPhone. Se desactiva la registración pero la
 * tarjeta queda: si vuelve a /j/{slug}, recupera su progreso (SPEC §5.5).
 */
export async function unregisterDevice(deviceId: string, cardId: string): Promise<void> {
  const db = createAdminClient();
  await db
    .from("apple_registrations")
    .update({ active: false })
    .eq("device_library_identifier", deviceId)
    .eq("card_id", cardId);
}

/** Passes registrados activamente en un dispositivo, con su última modificación. */
export async function registeredPassesFor(deviceId: string): Promise<RegisteredPass[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("apple_registrations")
    .select("card_id, cards(apple_updated_at)")
    .eq("device_library_identifier", deviceId)
    .eq("active", true);

  if (error) throw new Error(`No se pudieron leer las registraciones: ${error.message}`);

  return (data ?? []).flatMap((row) => {
    // PostgREST devuelve la relación como objeto (FK many-to-one).
    const card = Array.isArray(row.cards) ? row.cards[0] : row.cards;
    const updated = (card as { apple_updated_at?: string } | null)?.apple_updated_at;
    return updated ? [{ serial: row.card_id as string, updatedAt: new Date(updated) }] : [];
  });
}

/** Push tokens de los dispositivos que tienen este pass (iPhone, Watch…). */
export async function activePushTokensFor(cardId: string): Promise<string[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("apple_registrations")
    .select("push_token")
    .eq("card_id", cardId)
    .eq("active", true);
  return (data ?? []).map((r) => r.push_token as string);
}

/** Apple avisó que estos tokens ya no existen (410): dejamos de pushearles. */
export async function deactivatePushTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const db = createAdminClient();
  await db.from("apple_registrations").update({ active: false }).in("push_token", tokens);
}
