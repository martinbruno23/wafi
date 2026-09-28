/**
 * Genera un .pkpass de prueba y verifica su estructura y su firma.
 *
 * Usa los APPLE_* del entorno. Si no están, crea un certificado AUTOFIRMADO
 * descartable: sirve para validar nuestra parte (contenido, manifest, firma),
 * pero iOS no lo acepta — para eso hace falta el certificado real del
 * Pass Type ID.
 *
 * Uso: npx tsx --conditions react-server scripts/apple-pkpass-check.mts [salida.pkpass]
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const work = mkdtempSync(join(tmpdir(), "wafi-pkpass-"));
const out = process.argv[2] ?? join(work, "wafi-test.pkpass");

// .env.local (sin pisar lo que ya venga del entorno)
if (existsSync(".env.local")) {
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
}

let selfSigned = false;
if (!process.env.APPLE_PASS_CERT_B64) {
  selfSigned = true;
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=Pass Type ID: pass.app.wafi.card (AUTOFIRMADO DE PRUEBA)",
    "-keyout", join(work, "key.pem"), "-out", join(work, "cert.pem"),
  ], { stdio: "ignore" });
  process.env.APPLE_PASS_CERT_B64 = readFileSync(join(work, "cert.pem")).toString("base64");
  process.env.APPLE_PASS_KEY_B64 = readFileSync(join(work, "key.pem")).toString("base64");
  process.env.APPLE_TEAM_ID ??= "TEST123456";
  process.env.APPLE_PASS_TYPE_ID ??= "pass.app.wafi.card";
}
process.env.NEXT_PUBLIC_APP_URL = "https://wafi-iota.vercel.app";

const { buildPkpass } = await import("../src/lib/wallet/apple/pkpass");

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const buf = buildPkpass({
  card: {
    id: "3f1c2a9e-0000-4000-8000-000000000001",
    customerId: "c1",
    merchantId: "m1",
    qrToken: "qr-token-de-prueba",
    currentStamps: 3,
    totalStamps: 3,
    prizesRedeemed: 0,
    googleObjectId: null,
  },
  merchant: {
    id: "m1",
    slug: "cafe-prueba",
    name: "Café de Prueba",
    brandColor: "#8B5E3C",
    stampsRequired: 5,
    prizeDescription: "Café gratis",
    logoUrl: null,
    coverUrl: null,
    programName: null,
    isActive: true,
    googleClassId: null,
  },
  authToken: "0123456789abcdef0123456789abcdef",
  lastEvent: "stamp",
  location: { lat: -34.6627, lng: -58.3653 },
});
writeFileSync(out, buf);
check("se generó el .pkpass", buf.length > 0, `${(buf.length / 1024).toFixed(1)} KB`);

// Descomprimir y revisar
const dir = join(work, "unzipped");
execFileSync("unzip", ["-q", "-o", out, "-d", dir]);
const listing = execFileSync("unzip", ["-Z1", out]).toString().trim().split("\n");
for (const f of ["pass.json", "manifest.json", "signature", "icon.png", "icon@2x.png", "logo.png"]) {
  check(`contiene ${f}`, listing.includes(f));
}

const pass = JSON.parse(readFileSync(join(dir, "pass.json"), "utf8"));
check("pass.json es un storeCard", Boolean(pass.storeCard));
check("QR con el qr_token", pass.barcodes?.[0]?.message === "qr-token-de-prueba");
check(
  "web service registrado (HTTPS)",
  pass.webServiceURL === "https://wafi-iota.vercel.app/api/apple-wallet",
);

// manifest.json = SHA-1 de cada archivo
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const bad = Object.entries(manifest).filter(([name, sha]) => {
  const actual = createHash("sha1").update(readFileSync(join(dir, name))).digest("hex");
  return actual !== sha;
});
check(
  "los hashes del manifest coinciden con los archivos",
  bad.length === 0 && Object.keys(manifest).length === listing.length - 2,
  `${Object.keys(manifest).length} archivos`,
);

// La firma PKCS#7 tiene que validar sobre manifest.json
try {
  execFileSync("openssl", [
    "smime", "-verify", "-noverify", "-binary", "-inform", "DER",
    "-in", join(dir, "signature"), "-content", join(dir, "manifest.json"),
    "-out", "/dev/null",
  ], { stdio: "pipe" });
  check("la firma valida sobre el manifest", true);
} catch (e) {
  check("la firma valida sobre el manifest", false, String((e as Error).message).slice(0, 120));
}

const certs = execFileSync("openssl", [
  "pkcs7", "-inform", "DER", "-in", join(dir, "signature"), "-print_certs", "-noout",
]).toString();
check(
  "la firma incluye el intermedio WWDR G4 de Apple",
  /Worldwide Developer Relations/.test(certs) && /OU ?= ?G4/.test(certs),
);

console.log(`\n${failures === 0 ? "✅" : "❌"} ${failures} fallo(s). Archivo: ${out}`);
if (selfSigned) {
  console.log("⚠️  Firmado con certificado AUTOFIRMADO: estructura válida, pero iOS lo va a rechazar.");
}
process.exit(failures === 0 ? 0 : 1);
