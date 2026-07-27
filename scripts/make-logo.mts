/**
 * Genera el logo por defecto de WAFI en PNG, para los comercios que todavía no
 * cargaron el suyo. Google Wallet exige un programLogo en cada LoyaltyClass.
 *
 * La "W" se dibuja como polyline (no como texto) para no depender de fuentes
 * instaladas en la máquina que corra esto.
 *
 * Uso: npx tsx scripts/make-logo.mts
 */
import sharp from "sharp";

const SIZE = 660; // recomendado por Google para programLogo

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#2D2D2D"/>
  <polyline points="22,32 34,70 50,44 66,70 78,32"
    fill="none" stroke="#FAFAF8" stroke-width="9"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile("public/wafi-logo.png");

const meta = await sharp("public/wafi-logo.png").metadata();
console.log(`✓ public/wafi-logo.png — ${meta.width}×${meta.height}, ${meta.format}`);
