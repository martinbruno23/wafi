/**
 * Crea los comercios demo y un usuario de dashboard para cada uno.
 * Idempotente: se puede correr las veces que haga falta.
 * Correr con: npm run seed
 *
 * Cada usuario pertenece a un solo comercio: `requireMerchantSession` asume
 * una membresía por usuario.
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

/** URL pública de los assets: Google Wallet los descarga, así que no sirve localhost. */
const ASSETS = "https://wafi-iota.vercel.app";

type DemoMerchant = {
  merchant: Record<string, unknown> & { slug: string; name: string };
  user: { email: string; password: string };
};

const DEMOS: DemoMerchant[] = [
  {
    merchant: {
      slug: "cafe-prueba",
      name: "Café de Prueba",
      address: "Av. Siempreviva 742",
      brand_color: "#8B5E3C",
      stamps_required: 5,
      prize_description: "Café gratis",
      is_active: true,
    },
    user: { email: "demo@wafi.test", password: "wafi-demo-1234" },
  },
  {
    // Demo para mostrarle a Batata Cofi (batatacofi.com) cómo se vería su
    // tarjeta. Usa su marca: es para presentarle la propuesta al dueño, no
    // para sus clientes. Slug no obvio para que no lo encuentre cualquiera.
    // Su programa real es por puntos con 5 niveles; acá se muestra con la
    // mecánica de sellos de WAFI.
    merchant: {
      slug: "batata-demo",
      name: "Batata Cofi",
      program_name: "Batateros Club",
      address: "Avellaneda, Buenos Aires",
      brand_color: "#7B2D3B",
      logo_url: `${ASSETS}/demo/batata/logo.png`,
      cover_url: `${ASSETS}/demo/batata/hero.png`,
      logo_wide_url: `${ASSETS}/demo/batata/logo-wide.png`,
      stamp_icon_url: `${ASSETS}/demo/batata/stamp.png`,
      stamps_required: 5,
      prize_description: "Tu premio Bienvenida Batatera",
      is_active: true,
    },
    user: { email: "batata-demo@wafi.test", password: "wafi-batata-1234" },
  },
];

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function ensureUser(email: string, password: string): Promise<string> {
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created?.user) return created.user.id;

  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  const id = list?.users.find((u) => u.email === email)?.id;
  if (!id) throw error ?? new Error(`No se pudo crear el usuario ${email}`);
  return id;
}

async function main() {
  for (const { merchant: m, user } of DEMOS) {
    const { data: merchant, error } = await db
      .from("merchants")
      .upsert(m, { onConflict: "slug" })
      .select("id, name, slug, stamps_required")
      .single();
    if (error) throw error;

    const userId = await ensureUser(user.email, user.password);
    const { error: membershipError } = await db
      .from("merchant_users")
      .upsert(
        { user_id: userId, merchant_id: merchant.id, role: "owner" },
        { onConflict: "user_id,merchant_id" },
      );
    if (membershipError) throw membershipError;

    console.log(
      `✓ ${merchant.name} — /j/${merchant.slug} (${merchant.stamps_required} sellos)` +
        ` · dashboard: ${user.email} / ${user.password}`,
    );
  }
}

main().catch((error) => {
  console.error("✗ Seed falló:", error.message ?? error);
  process.exit(1);
});
