import "server-only";
import { PKPass } from "passkit-generator";
import { env } from "@/lib/env";
import { APPLE_WWDR_G4_PEM } from "./wwdr";
import { buildPassJson, type PassContentInput } from "./pass-content";
import { iconFiles, logoFiles, stripFiles } from "./images";

export type PkpassInput = Omit<
  PassContentInput,
  "passTypeId" | "teamId" | "appUrl" | "hasStrip" | "hasWideLogo"
>;

/**
 * Genera el .pkpass firmado de una tarjeta — SPEC §8.2.
 *
 * El contenido (pass.json) sale de `buildPassJson`, que es puro y está
 * testeado. Acá se suman las imágenes con la marca del comercio (logo, ícono
 * y la franja de sellos) y se firma con el certificado del Pass Type ID.
 * Todo en memoria: no se lee nada del disco.
 */
export async function buildPkpass(input: PkpassInput): Promise<Buffer> {
  const [logo, icon, strip] = await Promise.all([
    logoFiles(input.merchant),
    iconFiles(input.merchant),
    stripFiles(input.card, input.merchant),
  ]);

  const passJson = buildPassJson({
    ...input,
    appUrl: env.appUrl,
    passTypeId: env.applePassTypeId,
    teamId: env.appleTeamId,
    hasStrip: strip !== null,
    hasWideLogo: logo.wide,
  });

  const pass = new PKPass(
    {
      "pass.json": Buffer.from(JSON.stringify(passJson), "utf8"),
      ...icon,
      ...logo.files,
      ...(strip ?? {}),
    },
    {
      wwdr: APPLE_WWDR_G4_PEM,
      signerCert: env.applePassCertPem,
      signerKey: env.applePassKeyPem,
      signerKeyPassphrase: env.applePassKeyPassphrase,
    },
  );

  return pass.getAsBuffer();
}
