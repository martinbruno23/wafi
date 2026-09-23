/**
 * Genera los assets del pass de Apple Wallet y los embebe en base64 en
 * src/lib/wallet/apple/assets.generated.ts (así no dependemos de leer archivos
 * del disco en las funciones de Vercel).
 *
 * - icon: el que muestra iOS en notificaciones y lockscreen (29/58/87 px).
 * - logo: esquina superior izquierda del pass (50/100/150 px). Dos variantes,
 *   trazo claro u oscuro, según el contraste con el brand_color del café.
 *
 * La "W" es una polyline, no texto: no depende de fuentes instaladas.
 * Uso: npx tsx scripts/make-apple-assets.mts
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const W_POINTS = "22,32 34,70 50,44 66,70 78,32";

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#2D2D2D"/>
  <polyline points="${W_POINTS}" fill="none" stroke="#FAFAF8" stroke-width="9"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const logoSvg = (stroke: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="14 24 72 54">
  <polyline points="${W_POINTS}" fill="none" stroke="${stroke}" stroke-width="10"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

async function png(svg: string, width: number, height: number): Promise<string> {
  const buf = await sharp(Buffer.from(svg), { density: 600 })
    .resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return buf.toString("base64");
}

const files: Record<string, string> = {
  "icon.png": await png(iconSvg, 29, 29),
  "icon@2x.png": await png(iconSvg, 58, 58),
  "icon@3x.png": await png(iconSvg, 87, 87),
};

const logos: Record<"light" | "dark", Record<string, string>> = {
  light: {
    "logo.png": await png(logoSvg("#FFFFFF"), 50, 38),
    "logo@2x.png": await png(logoSvg("#FFFFFF"), 100, 76),
    "logo@3x.png": await png(logoSvg("#FFFFFF"), 150, 113),
  },
  dark: {
    "logo.png": await png(logoSvg("#1A1A1A"), 50, 38),
    "logo@2x.png": await png(logoSvg("#1A1A1A"), 100, 76),
    "logo@3x.png": await png(logoSvg("#1A1A1A"), 150, 113),
  },
};

const out = `// ARCHIVO GENERADO por scripts/make-apple-assets.mts — no editar a mano.

/** Íconos del pass (notificaciones / lockscreen), base64. */
export const APPLE_ICON_FILES: Record<string, string> = ${JSON.stringify(files, null, 2)};

/** Logo del pass en dos variantes según contraste con el color del café. */
export const APPLE_LOGO_FILES: Record<"light" | "dark", Record<string, string>> = ${JSON.stringify(logos, null, 2)};
`;

writeFileSync("src/lib/wallet/apple/assets.generated.ts", out);

const kb = Math.round(out.length / 1024);
console.log(`✓ src/lib/wallet/apple/assets.generated.ts (${kb} KB)`);
