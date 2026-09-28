/**
 * Actualiza en Google Wallet el diseño del programa (LoyaltyClass) de cada
 * comercio activo: nombre, programa, color, logo y banner.
 *
 * Las altas ya no lo hacen (serían dos llamadas a Google por cliente), así que
 * hay que correrlo cuando un comercio cambia su marca. Cuando exista el
 * dashboard, lo va a disparar la pantalla de configuración.
 *
 * Uso: npm run wallet:sync-classes
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0 && !process.env[t.slice(0, i)]) {
    let v = t.slice(i + 1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[t.slice(0, i)] = v;
  }
}

const { ensureLoyaltyClass } = await import("../src/lib/wallet/google");
const { toMerchant, MERCHANT_COLS } = await import("../src/lib/services/enrollment");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const { data: rows, error } = await db
  .from("merchants")
  .select(MERCHANT_COLS)
  .eq("is_active", true);
if (error) throw error;

let failures = 0;
for (const row of rows ?? []) {
  const merchant = toMerchant(row);
  try {
    const classId = await ensureLoyaltyClass(merchant);
    if (!merchant.googleClassId) {
      await db.from("merchants").update({ google_class_id: classId }).eq("id", merchant.id);
    }
    console.log(`✓ ${merchant.name} (${merchant.slug})`);
  } catch (e) {
    failures++;
    console.error(`✗ ${merchant.name}: ${(e as Error).message}`);
  }
}
process.exit(failures === 0 ? 0 : 1);
