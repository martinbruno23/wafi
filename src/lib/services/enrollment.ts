import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Card, Merchant } from "@/lib/domain/card";

/** Errores de negocio del enrolamiento (los route handlers los mapean a HTTP). */
export class EnrollmentError extends Error {
  constructor(
    public code: "MERCHANT_NOT_FOUND" | "DB_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "EnrollmentError";
  }
}

export type EnrollmentResult = {
  card: Card;
  merchant: Merchant;
  /** true si el cliente ya tenía tarjeta en este comercio (no se duplicó). */
  existing: boolean;
};

/** El email es la identidad del cliente: se normaliza siempre igual. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type MerchantRow = {
  id: string;
  slug: string;
  name: string;
  brand_color: string;
  stamps_required: number;
  prize_description: string;
  logo_url: string | null;
  is_active: boolean;
};

type CardRow = {
  id: string;
  customer_id: string;
  merchant_id: string;
  qr_token: string;
  current_stamps: number;
  total_stamps: number;
  prizes_redeemed: number;
};

export function toMerchant(row: MerchantRow): Merchant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brandColor: row.brand_color,
    stampsRequired: row.stamps_required,
    prizeDescription: row.prize_description,
    logoUrl: row.logo_url,
    isActive: row.is_active,
  };
}

export function toCard(row: CardRow): Card {
  return {
    id: row.id,
    customerId: row.customer_id,
    merchantId: row.merchant_id,
    qrToken: row.qr_token,
    currentStamps: row.current_stamps,
    totalStamps: row.total_stamps,
    prizesRedeemed: row.prizes_redeemed,
  };
}

const MERCHANT_COLS =
  "id, slug, name, brand_color, stamps_required, prize_description, logo_url, is_active";
const CARD_COLS =
  "id, customer_id, merchant_id, qr_token, current_stamps, total_stamps, prizes_redeemed";

/**
 * Da de alta a un cliente en un comercio — SPEC §5.2.
 *
 * - El email no se verifica acá: la identidad operativa del pass es el qr_token
 *   de la card; el email es el ancla para la landing /mi y la app futura.
 * - Un mismo cliente en otro comercio reusa su customer y obtiene otra card.
 * - Re-enrolarse en el mismo comercio NO duplica: devuelve `existing: true`.
 *
 * Usa el cliente admin (service_role) porque escribe saltando RLS.
 */
export async function enrollCustomer(
  merchantSlug: string,
  email: string,
  client?: SupabaseClient,
): Promise<EnrollmentResult> {
  const db = client ?? createAdminClient();
  const normalizedEmail = normalizeEmail(email);

  // 1. El comercio tiene que existir y estar activo.
  const { data: merchantRow, error: merchantError } = await db
    .from("merchants")
    .select(MERCHANT_COLS)
    .eq("slug", merchantSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (merchantError) {
    throw new EnrollmentError("DB_ERROR", merchantError.message);
  }
  if (!merchantRow) {
    throw new EnrollmentError(
      "MERCHANT_NOT_FOUND",
      `No existe un comercio activo con slug "${merchantSlug}"`,
    );
  }
  const merchant = toMerchant(merchantRow as MerchantRow);

  // 2. Upsert del cliente por email (identidad única global).
  const { data: customerRow, error: customerError } = await db
    .from("customers")
    .upsert({ email: normalizedEmail }, { onConflict: "email" })
    .select("id")
    .single();

  if (customerError || !customerRow) {
    throw new EnrollmentError(
      "DB_ERROR",
      customerError?.message ?? "No se pudo crear el cliente",
    );
  }

  // 3. Card única por (customer, merchant). ignoreDuplicates evita el duplicado
  //    y nos deja detectar si ya existía.
  const { data: insertedRows, error: cardError } = await db
    .from("cards")
    .upsert(
      { customer_id: customerRow.id, merchant_id: merchant.id },
      { onConflict: "customer_id,merchant_id", ignoreDuplicates: true },
    )
    .select(CARD_COLS);

  if (cardError) {
    throw new EnrollmentError("DB_ERROR", cardError.message);
  }

  if (insertedRows && insertedRows.length > 0) {
    return { card: toCard(insertedRows[0] as CardRow), merchant, existing: false };
  }

  // 4. No insertó nada → la card ya existía: la buscamos.
  const { data: existingRow, error: existingError } = await db
    .from("cards")
    .select(CARD_COLS)
    .eq("customer_id", customerRow.id)
    .eq("merchant_id", merchant.id)
    .single();

  if (existingError || !existingRow) {
    throw new EnrollmentError(
      "DB_ERROR",
      existingError?.message ?? "No se pudo recuperar la tarjeta existente",
    );
  }

  return { card: toCard(existingRow as CardRow), merchant, existing: true };
}
