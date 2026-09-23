/**
 * Simula el lado del iPhone contra nuestro PassKit Web Service (Etapa 4).
 * Recorre el ciclo de vida completo de un pass: alta → descarga → registro del
 * dispositivo → sello → el iPhone pregunta qué cambió → baja el pass nuevo →
 * borra el pass.
 *
 * Requiere `npm run dev` corriendo con APPLE_* configurado (sirve un
 * certificado autofirmado: acá no se prueba la firma, sino el protocolo).
 * Uso: npx tsx scripts/apple-e2e-check.ts
 */
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const file of [".env.local", ".env.development.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) {
        let v = t.slice(i + 1);
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        process.env[t.slice(0, i)] = v;
      }
    }
  } catch {
    // el archivo es opcional
  }
}

const BASE = "http://localhost:3000";
const WS = `${BASE}/api/apple-wallet/v1`;
const PASS_TYPE = process.env.APPLE_PASS_TYPE_ID!;
const DEVICE = `test-device-${Date.now()}`;
const PUSH_TOKEN = "0".repeat(64); // token de mentira: APNs lo va a rechazar

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(SUPA, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function passJsonFrom(buf: ArrayBuffer) {
  const dir = mkdtempSync(join(tmpdir(), "wafi-apple-e2e-"));
  writeFileSync(join(dir, "p.pkpass"), Buffer.from(buf));
  return JSON.parse(execFileSync("unzip", ["-p", join(dir, "p.pkpass"), "pass.json"]).toString());
}

async function merchantCookie(): Promise<string> {
  const anon = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data } = await anon.auth.signInWithPassword({
    email: "demo@wafi.test",
    password: "wafi-demo-1234",
  });
  const name = `sb-${new URL(SUPA).hostname.split(".")[0]}-auth-token`;
  return `${name}=base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;
}

async function main() {
  // 1. Alta desde un iPhone
  const enroll = (await fetch(`${BASE}/api/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      merchantSlug: "cafe-prueba",
      email: `apple-e2e-${Date.now()}@test.com`,
      platform: "apple",
    }),
  }).then((r) => r.json())) as { cardId: string; apple?: { pkpassUrl: string } };

  const pkpassUrl = enroll.apple?.pkpassUrl ?? "";
  check("el alta devuelve el link del .pkpass", pkpassUrl.includes(`/api/passes/apple/${enroll.cardId}?t=`));
  const token = new URL(pkpassUrl).searchParams.get("t")!;
  const auth = { authorization: `ApplePass ${token}` };

  // 2. Descarga (lo que hace Safari)
  const dl = await fetch(pkpassUrl);
  check(
    "Safari recibe un .pkpass",
    dl.status === 200 && dl.headers.get("content-type") === "application/vnd.apple.pkpass",
    `status ${dl.status}`,
  );
  const first = passJsonFrom(await dl.arrayBuffer());
  check("arranca en 0/5", first.storeCard.headerFields[0].value === "0/5");

  const wrong = await fetch(pkpassUrl.replace(/t=[^&]+/, "t=otro"));
  check("con otro token no se descarga", wrong.status === 404, `status ${wrong.status}`);

  // 3. El iPhone se registra
  const regUrl = `${WS}/devices/${DEVICE}/registrations/${PASS_TYPE}/${enroll.cardId}`;
  const reg = { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ pushToken: PUSH_TOKEN }) };
  const r1 = await fetch(regUrl, reg);
  check("primer registro → 201", r1.status === 201, `status ${r1.status}`);
  const r2 = await fetch(regUrl, reg);
  check("registro repetido → 200", r2.status === 200, `status ${r2.status}`);
  const r3 = await fetch(regUrl, { ...reg, headers: { "content-type": "application/json" } });
  check("sin token → 401", r3.status === 401, `status ${r3.status}`);
  const r4 = await fetch(regUrl, { ...reg, headers: { authorization: "ApplePass mal", "content-type": "application/json" } });
  check("con token ajeno → 401", r4.status === 401, `status ${r4.status}`);
  const r5 = await fetch(regUrl.replace(PASS_TYPE, "pass.com.otro"), reg);
  check("otro Pass Type ID → 404", r5.status === 404, `status ${r5.status}`);

  // 4. Primera consulta de cambios
  const listUrl = `${WS}/devices/${DEVICE}/registrations/${PASS_TYPE}`;
  const l1 = await fetch(listUrl);
  const l1Body = (await l1.json()) as { serialNumbers: string[]; lastUpdated: string };
  check("el dispositivo ve su pass", l1.status === 200 && l1Body.serialNumbers.includes(enroll.cardId));
  const l2 = await fetch(`${listUrl}?passesUpdatedSince=${l1Body.lastUpdated}`);
  check("sin cambios → 204", l2.status === 204, `status ${l2.status}`);

  // 5. El comercio sella (dispara notifyWallets → APNs con token de mentira)
  await new Promise((r) => setTimeout(r, 1100)); // Last-Modified tiene precisión de segundos
  const stamp = await fetch(`${BASE}/api/cards/${enroll.cardId}/stamp`, {
    method: "POST",
    headers: { cookie: await merchantCookie() },
  });
  check("el sello se registra aunque APNs rechace el push", stamp.status === 200, `status ${stamp.status}`);

  // 6. El iPhone pregunta qué cambió y baja el pass nuevo
  const l3 = await fetch(`${listUrl}?passesUpdatedSince=${l1Body.lastUpdated}`);
  const l3Body = l3.status === 200 ? ((await l3.json()) as { serialNumbers: string[] }) : null;
  check("tras el sello, el pass figura como cambiado", Boolean(l3Body?.serialNumbers.includes(enroll.cardId)), `status ${l3.status}`);

  const passUrl = `${WS}/passes/${PASS_TYPE}/${enroll.cardId}`;
  const p1 = await fetch(passUrl, { headers: { ...auth, "if-modified-since": new Date(Date.now() - 60_000).toUTCString() } });
  const updated = p1.status === 200 ? passJsonFrom(await p1.arrayBuffer()) : null;
  const header = updated?.storeCard.headerFields[0];
  check("baja el pass actualizado a 1/5", header?.value === "1/5", header?.value);
  check("con la notificación de nuevo sello", /Nuevo sello en Café de Prueba/.test(header?.changeMessage ?? ""), header?.changeMessage);

  const p2 = await fetch(passUrl, { headers: { ...auth, "if-modified-since": p1.headers.get("last-modified")! } });
  check("si ya lo tiene → 304", p2.status === 304, `status ${p2.status}`);
  const p3 = await fetch(passUrl);
  check("bajar el pass sin token → 401", p3.status === 401, `status ${p3.status}`);

  // 7. APNs rechazó el token de mentira → la registración queda desactivada
  const { data: regRow } = await admin
    .from("apple_registrations")
    .select("active")
    .eq("device_library_identifier", DEVICE)
    .single();
  console.log(`  (registración tras el push: active=${regRow?.active} — con un cert autofirmado APNs rechaza la conexión, así que puede seguir activa)`);

  // 8. El usuario borra el pass
  const del = await fetch(regUrl, { method: "DELETE", headers: auth });
  check("borrar el pass → 200", del.status === 200, `status ${del.status}`);
  const l4 = await fetch(listUrl);
  check("después de borrarlo, el dispositivo no tiene passes → 204", l4.status === 204, `status ${l4.status}`);

  // 9. Logs del dispositivo
  const log = await fetch(`${WS}/log`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ logs: ["prueba desde apple-e2e-check"] }) });
  check("iOS puede reportar errores al /log", log.status === 200);

  await admin.from("apple_registrations").delete().eq("device_library_identifier", DEVICE);

  console.log(failures === 0 ? "\n✅ Protocolo de Apple Wallet OK." : `\n❌ ${failures} chequeo(s) fallaron.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("✗ falló:", e.message ?? e);
  process.exit(1);
});
