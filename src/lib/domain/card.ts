/**
 * Lógica de dominio de las tarjetas de fidelización — SPEC §6.
 * Módulo puro: sin I/O, sin Supabase. Todo lo que decide "cuándo hay premio"
 * o cómo se le muestra una tarjeta al cajero vive acá y está testeado.
 */

export type Merchant = {
  id: string;
  slug: string;
  name: string;
  brandColor: string;
  stampsRequired: number;
  prizeDescription: string;
  logoUrl: string | null;
  isActive: boolean;
  /** LoyaltyClass de Google Wallet, si ya se creó (SPEC §8.1). */
  googleClassId: string | null;
};

export type Card = {
  id: string;
  customerId: string;
  merchantId: string;
  qrToken: string;
  currentStamps: number;
  totalStamps: number;
  prizesRedeemed: number;
  /** LoyaltyObject de Google Wallet, si ya se emitió el pass. */
  googleObjectId: string | null;
};

export type Customer = {
  id: string;
  email: string;
};

/** Respuesta de `GET /api/scan/[qrToken]` — lo que ve el cajero al escanear. */
export type CardScanState = {
  cardId: string;
  customerEmailMasked: string;
  currentStamps: number;
  stampsRequired: number;
  hasPrize: boolean;
  prizeDescription: string;
};

/**
 * Hay premio cuando los sellos alcanzan o superan los requeridos.
 * Puede haber más sellos que los requeridos: el cliente sigue sumando
 * aunque no canjee, y no pierde nada.
 */
export function hasPrize(
  card: { currentStamps: number },
  merchant: { stampsRequired: number },
): boolean {
  return card.currentStamps >= merchant.stampsRequired;
}

/**
 * Enmascara el email para mostrarlo en el scanner del comercio sin exponer
 * el dato completo del cliente: "martin@gmail.com" → "mar***@gmail.com".
 * Con locales de 1–3 caracteres enmascara todo: "ab@x.com" → "***@x.com".
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";

  const local = email.slice(0, at);
  const domain = email.slice(at); // incluye la "@"

  if (local.length <= 3) return `***${domain}`;
  return `${local.slice(0, 3)}***${domain}`;
}

/** Arma el estado que consume el scanner del comercio. */
export function toScanState(
  card: Card,
  merchant: Merchant,
  customer: Customer,
): CardScanState {
  return {
    cardId: card.id,
    customerEmailMasked: maskEmail(customer.email),
    currentStamps: card.currentStamps,
    stampsRequired: merchant.stampsRequired,
    hasPrize: hasPrize(card, merchant),
    prizeDescription: merchant.prizeDescription,
  };
}
