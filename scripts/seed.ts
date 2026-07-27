/**
 * Crea el comercio demo y su usuario de dashboard.
 * Correr con: npx tsx scripts/seed.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i);
    if (!process.env[key]) process.env[key] = trimmed.slice(i + 1);
  }
}

loadEnv();

const DEMO_EMAIL = "demo@wafi.test";
const DEMO_PASSWORD = "wafi-demo-1234";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  // 1. Comercio demo.
  const { data: merchant, error: merchantError } = await db
    .from("merchants")
    .upsert(
      {
        slug: "cafe-prueba",
        name: "Café de Prueba",
        address: "Av. Siempreviva 742",
        brand_color: "#8B5E3C",
        stamps_required: 5,
        prize_description: "Café gratis",
        is_active: true,
      },
      { onConflict: "slug" },
    )
    .select("id, name, slug, stamps_required")
    .single();

  if (merchantError) throw merchantError;
  console.log(`✓ Comercio: ${merchant.name} (${merchant.slug})`);

  // 2. Usuario de dashboard (idempotente: si ya existe, lo buscamos).
  let userId: string | undefined;

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });

  if (created?.user) {
    userId = created.user.id;
    console.log(`✓ Usuario creado: ${DEMO_EMAIL}`);
  } else {
    const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
    userId = list?.users.find((u) => u.email === DEMO_EMAIL)?.id;
    if (!userId) throw createError ?? new Error("No se pudo crear el usuario demo");
    console.log(`✓ Usuario ya existía: ${DEMO_EMAIL}`);
  }

  // 3. Membresía.
  const { error: membershipError } = await db
    .from("merchant_users")
    .upsert(
      { user_id: userId, merchant_id: merchant.id, role: "owner" },
      { onConflict: "user_id,merchant_id" },
    );

  if (membershipError) throw membershipError;
  console.log("✓ Membresía vinculada");

  console.log(
    `\nListo. Login del dashboard: ${DEMO_EMAIL} / ${DEMO_PASSWORD}` +
      `\nLanding de alta: /j/${merchant.slug} (${merchant.stamps_required} sellos)`,
  );
}

main().catch((error) => {
  console.error("✗ Seed falló:", error.message ?? error);
  process.exit(1);
});
