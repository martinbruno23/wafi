/**
 * Verificación end-to-end de los endpoints autenticados (Etapa 1).
 * Simula la sesión del comercio y recorre: scan → sellar ×N → canjear,
 * más los casos de rechazo (tarjeta de otro comercio, canje sin premio).
 *
 * Requiere `npm run dev` corriendo. Uso: npx tsx scripts/e2e-check.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0 && !process.env[t.slice(0, i)]) {
      process.env[t.slice(0, i)] = t.slice(i + 1);
    }
  }
}
loadEnv();

const BASE = "http://localhost:3000";
const URL_SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL_SUPA, SERVICE, { auth: { persistSession: false } });

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/** Cookie de sesión con el formato que espera @supabase/ssr. */
function sessionCookie(session: unknown): string {
  const name = `sb-${new global.URL(URL_SUPA).hostname.split(".")[0]}-auth-token`;
  const value =
    "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${name}=${value}`;
}

async function main() {
  // --- Sesión del comercio demo ---
  const anonClient = createClient(URL_SUPA, ANON, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await anonClient.auth.signInWithPassword({
    email: "demo@wafi.test",
    password: "wafi-demo-1234",
  });
  if (authError || !auth.session) throw new Error(`Login falló: ${authError?.message}`);
  const cookie = sessionCookie(auth.session);
  check("login del comercio demo", true);

  // --- Tarjeta de prueba en el comercio demo ---
  const enroll = await fetch(`${BASE}/api/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      merchantSlug: "cafe-prueba",
      email: `e2e-${Date.now()}@test.com`,
      platform: "unknown",
    }),
  }).then((r) => r.json());

  const { data: card } = await admin
    .from("cards")
    .select("qr_token, current_stamps")
    .eq("id", enroll.cardId)
    .single();
  const qrToken = card!.qr_token as string;
  check("enrolamiento crea la tarjeta", card!.current_stamps === 0, "arranca en 0 sellos");

  // --- Scan ---
  const scan = await fetch(`${BASE}/api/scan/${qrToken}`, { headers: { cookie } });
  const scanBody = await scan.json();
  check(
    "scan devuelve el estado de la tarjeta",
    scan.status === 200 && scanBody.stampsRequired === 5 && scanBody.hasPrize === false,
    `${scanBody.currentStamps}/${scanBody.stampsRequired}, email ${scanBody.customerEmailMasked}`,
  );
  check(
    "scan enmascara el email y no filtra el qr_token",
    !JSON.stringify(scanBody).includes(qrToken) &&
      String(scanBody.customerEmailMasked).includes("***"),
  );

  // --- Canje sin premio → 409 ---
  const early = await fetch(`${BASE}/api/cards/${enroll.cardId}/redeem`, {
    method: "POST",
    headers: { cookie },
  });
  check("canje sin premio rechazado", early.status === 409, `status ${early.status}`);

  // --- Sellar 5 veces ---
  let last: { currentStamps: number; hasPrize: boolean } | null = null;
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(`${BASE}/api/cards/${enroll.cardId}/stamp`, {
      method: "POST",
      headers: { cookie },
    });
    last = await res.json();
    if (res.status !== 200) {
      check(`sello ${i}`, false, JSON.stringify(last));
      break;
    }
  }
  check(
    "5 sellos suman y habilitan el premio",
    last?.currentStamps === 5 && last?.hasPrize === true,
    `${last?.currentStamps}/5, hasPrize=${last?.hasPrize}`,
  );

  // --- Canje ---
  const redeem = await fetch(`${BASE}/api/cards/${enroll.cardId}/redeem`, {
    method: "POST",
    headers: { cookie },
  });
  const redeemBody = await redeem.json();
  check(
    "canje descuenta los sellos y suma el premio",
    redeem.status === 200 &&
      redeemBody.currentStamps === 0 &&
      redeemBody.prizesRedeemed === 1 &&
      redeemBody.hasPrize === false,
    `quedó en ${redeemBody.currentStamps}/5, canjes: ${redeemBody.prizesRedeemed}`,
  );

  // --- Ledger ---
  const { data: events } = await admin
    .from("stamp_events")
    .select("type, stamps_delta")
    .eq("card_id", enroll.cardId)
    .order("created_at", { ascending: true });
  const stamps = events!.filter((e) => e.type === "stamp").length;
  const redeems = events!.filter((e) => e.type === "redeem");
  check(
    "el ledger registró cada movimiento",
    stamps === 5 && redeems.length === 1 && redeems[0].stamps_delta === -5,
    `${stamps} sellos + ${redeems.length} canje (delta ${redeems[0]?.stamps_delta})`,
  );

  // --- Anti-fraude: tarjeta de otro comercio ---
  const { data: other } = await admin
    .from("merchants")
    .upsert(
      {
        slug: "otro-cafe-e2e",
        name: "Otro Café",
        prize_description: "Medialuna",
        stamps_required: 3,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  const { data: otherCustomer } = await admin
    .from("customers")
    .upsert({ email: `otro-${Date.now()}@test.com` }, { onConflict: "email" })
    .select("id")
    .single();
  const { data: otherCard } = await admin
    .from("cards")
    .insert({ customer_id: otherCustomer!.id, merchant_id: other!.id })
    .select("id, qr_token")
    .single();

  const wrongScan = await fetch(`${BASE}/api/scan/${otherCard!.qr_token}`, {
    headers: { cookie },
  });
  const wrongBody = await wrongScan.json();
  check(
    "scan de tarjeta ajena rechazado",
    wrongScan.status === 403 && wrongBody.error?.code === "WRONG_MERCHANT",
    `status ${wrongScan.status}`,
  );

  const wrongStamp = await fetch(`${BASE}/api/cards/${otherCard!.id}/stamp`, {
    method: "POST",
    headers: { cookie },
  });
  check(
    "sellar tarjeta ajena rechazado",
    wrongStamp.status === 403,
    `status ${wrongStamp.status}`,
  );

  // --- Sin sesión ---
  const noAuth = await fetch(`${BASE}/api/cards/${enroll.cardId}/stamp`, {
    method: "POST",
  });
  check("sellar sin sesión rechazado", noAuth.status === 401, `status ${noAuth.status}`);

  // Limpieza del comercio de prueba.
  await admin.from("cards").delete().eq("id", otherCard!.id);
  await admin.from("merchants").delete().eq("id", other!.id);

  console.log(
    failures === 0
      ? "\n✅ Todo verde."
      : `\n❌ ${failures} chequeo(s) fallaron.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("✗ E2E falló:", e.message ?? e);
  process.exit(1);
});
