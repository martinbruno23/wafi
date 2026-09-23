import "server-only";
import { PKPass } from "passkit-generator";
import { env } from "@/lib/env";
import { APPLE_WWDR_G4_PEM } from "./wwdr";
import { APPLE_ICON_FILES, APPLE_LOGO_FILES } from "./assets.generated";
import {
  buildPassJson,
  logoVariantFor,
  type PassContentInput,
} from "./pass-content";

export type PkpassInput = Omit<PassContentInput, "passTypeId" | "teamId" | "appUrl">;

/**
 * Genera el .pkpass firmado de una tarjeta — SPEC §8.2.
 *
 * El contenido (pass.json) sale de `buildPassJson`, que es puro y está
 * testeado. Acá solo se suman los assets y se firma con el certificado del
 * Pass Type ID. Todo en memoria: no se lee nada del disco.
 */
export function buildPkpass(input: PkpassInput): Buffer {
  const passJson = buildPassJson({
    ...input,
    appUrl: env.appUrl,
    passTypeId: env.applePassTypeId,
    teamId: env.appleTeamId,
  });

  const files: Record<string, Buffer> = {
    "pass.json": Buffer.from(JSON.stringify(passJson), "utf8"),
  };

  const logos = APPLE_LOGO_FILES[logoVariantFor(input.merchant.brandColor)];
  for (const [name, b64] of Object.entries({ ...APPLE_ICON_FILES, ...logos })) {
    files[name] = Buffer.from(b64, "base64");
  }

  const pass = new PKPass(files, {
    wwdr: APPLE_WWDR_G4_PEM,
    signerCert: env.applePassCertPem,
    signerKey: env.applePassKeyPem,
    signerKeyPassphrase: env.applePassKeyPassphrase,
  });

  return pass.getAsBuffer();
}
