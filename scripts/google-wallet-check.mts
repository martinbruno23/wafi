/**
 * Verificación de la integración con Google Wallet contra la API real.
 * Uso: npx tsx --conditions react-server scripts/google-wallet-check.mts
 */
import { readFileSync } from "node:fs";

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

const { ensureLoyaltyClass, createLoyaltyObject, updateLoyaltyObject, buildSaveUrl } =
  await import("../src/lib/wallet/google");
const jwt = (await import("jsonwebtoken")).default;

const merchant = {
  id: "m-test",
  slug: "cafe-prueba",
  name: "Café de Prueba",
  brandColor: "#8B5E3C",
  stampsRequired: 5,
  prizeDescription: "Café gratis",
  logoUrl: null,
  isActive: true,
};

const card = {
  id: `test-${Date.now()}`,
  customerId: "c-test",
  merchantId: "m-test",
  qrToken: "tok-de-prueba-123",
  currentStamps: 0,
  totalStamps: 0,
  prizesRedeemed: 0,
};

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// 1. Clase del comercio
const classId = await ensureLoyaltyClass(merchant);
check("ensureLoyaltyClass", Boolean(classId), classId);

// 2. Idempotencia
const classId2 = await ensureLoyaltyClass(merchant);
check("ensureLoyaltyClass es idempotente", classId === classId2);

// 3. Objeto (pass del cliente)
const objectId = await createLoyaltyObject(card, merchant, { email: "test@test.com" });
check("createLoyaltyObject", Boolean(objectId), objectId);

// 4. Actualización tras sellar
await updateLoyaltyObject({ ...card, currentStamps: 5 }, merchant);
check("updateLoyaltyObject con premio disponible", true);

// 5. Save URL + JWT
const saveUrl = buildSaveUrl(objectId);
const token = saveUrl.split("/save/")[1];
const decoded = jwt.decode(token) as Record<string, unknown>;
const payload = decoded.payload as { loyaltyObjects: { id: string }[] };
check(
  "buildSaveUrl arma el JWT correcto",
  saveUrl.startsWith("https://pay.google.com/gp/v/save/") &&
    decoded.aud === "google" &&
    decoded.typ === "savetowallet" &&
    payload.loyaltyObjects[0].id === objectId,
  `${token.length} chars`,
);

console.log(
  failures === 0 ? "\n✅ Integración con Google Wallet OK." : `\n❌ ${failures} fallo(s).`,
);
console.log(`\nPass de prueba (abrilo desde un Android):\n${saveUrl}\n`);
process.exit(failures === 0 ? 0 : 1);
