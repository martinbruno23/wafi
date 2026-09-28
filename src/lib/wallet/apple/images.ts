import "server-only";
import type { Sharp, SharpOptions } from "sharp";
import { contrastForeground } from "@/lib/color";
import type { Card, Merchant } from "@/lib/domain/card";
import { APPLE_ICON_FILES, APPLE_LOGO_FILES } from "./assets.generated";
import { logoVariantFor } from "./pass-content";
import { stampLayout } from "./strip-layout";

/**
 * Imágenes del pass de Apple con la marca del comercio — SPEC §8.2/§8.3.
 *
 * - logo: su logo apaisado (máx. 160×50 pt), o la W de WAFI.
 * - icon: su logo cuadrado (notificaciones y lockscreen), o el de WAFI.
 * - strip: la franja con los sellos dibujados, llenos o vacíos.
 *
 * Nada de esto puede impedir que se genere el pass: ante cualquier falla se
 * usan los assets de WAFI (o se omite la franja, y el pass vuelve al texto).
 * Por eso `sharp` se carga recién cuando hace falta: es un módulo nativo, y si
 * no carga en el servidor (pasó en Vercel, 2026-09-28), importarlo arriba
 * tumbaba la generación entera del pass.
 */

type SharpFactory = (input?: Buffer | SharpOptions, options?: SharpOptions) => Sharp;
let sharpModule: Promise<SharpFactory | null> | null = null;

function loadSharp(): Promise<SharpFactory | null> {
  sharpModule ??= import("sharp")
    .then((m) => (m.default ?? m) as unknown as SharpFactory)
    .catch((error) => {
      console.error("[apple-wallet] no se pudo cargar sharp, se usan assets de WAFI:", error);
      return null;
    });
  return sharpModule;
}

type Files = Record<string, Buffer>;

const FETCH_TIMEOUT_MS = 4000;
const imageCache = new Map<string, Promise<Buffer | null>>();
const stripCache = new Map<string, Files>();
const STRIP_CACHE_MAX = 200;

/** Descarga una imagen una vez por instancia de función (Fluid reusa instancias). */
function fetchImage(url: string): Promise<Buffer | null> {
  let pending = imageCache.get(url);
  if (!pending) {
    pending = fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      .then(async (res) => (res.ok ? Buffer.from(await res.arrayBuffer()) : null))
      .catch(() => null)
      .then((buf) => {
        if (!buf) imageCache.delete(url); // reintentar la próxima vez
        return buf;
      });
    imageCache.set(url, pending);
  }
  return pending;
}

const fromBase64 = (files: Record<string, string>): Files =>
  Object.fromEntries(Object.entries(files).map(([k, v]) => [k, Buffer.from(v, "base64")]));

const SCALES = [
  ["", 1],
  ["@2x", 2],
  ["@3x", 3],
] as const;

export async function logoFiles(merchant: Merchant): Promise<{ files: Files; wide: boolean }> {
  const sharp = await loadSharp();
  const src = sharp && merchant.logoWideUrl ? await fetchImage(merchant.logoWideUrl) : null;
  if (sharp && src) {
    try {
      const files: Files = {};
      for (const [suffix, s] of SCALES) {
        files[`logo${suffix}.png`] = await sharp(src)
          .resize({ width: 160 * s, height: 50 * s, fit: "inside" })
          .png()
          .toBuffer();
      }
      return { files, wide: true };
    } catch (error) {
      console.error("[apple-wallet] logo del comercio inválido:", error);
    }
  }
  return { files: fromBase64(APPLE_LOGO_FILES[logoVariantFor(merchant.brandColor)]), wide: false };
}

export async function iconFiles(merchant: Merchant): Promise<Files> {
  const sharp = await loadSharp();
  const src = sharp && merchant.logoUrl ? await fetchImage(merchant.logoUrl) : null;
  if (sharp && src) {
    try {
      const files: Files = {};
      for (const [suffix, s] of SCALES) {
        files[`icon${suffix}.png`] = await sharp(src)
          .resize(29 * s, 29 * s, { fit: "contain", background: "#FFFFFF" })
          .flatten({ background: "#FFFFFF" })
          .png()
          .toBuffer();
      }
      return files;
    } catch (error) {
      console.error("[apple-wallet] ícono del comercio inválido:", error);
    }
  }
  return fromBase64(APPLE_ICON_FILES);
}

/** Tamaño de la franja de un storeCard: 375×123 pt. */
const STRIP_W = 1125;
const STRIP_H = 369;
const EMPTY_OPACITY = 0.28;

/** Un sello a partir de la silueta del comercio, en el color de contraste. */
async function stampFromIcon(
  sharp: SharpFactory,
  icon: Buffer,
  w: number,
  h: number,
  dark: boolean,
  opacity: number,
): Promise<Buffer> {
  let img = sharp(icon).resize(w, h, { fit: "fill" }).ensureAlpha();
  // La silueta viene en blanco; sobre fondos claros, el sello va oscuro.
  if (dark) img = img.negate({ alpha: false });
  const overlays =
    opacity < 1
      ? [
          {
            input: Buffer.from([255, 255, 255, Math.round(255 * opacity)]),
            raw: { width: 1, height: 1, channels: 4 as const },
            tile: true,
            blend: "dest-in" as const,
          },
        ]
      : [];
  return img.composite(overlays).png().toBuffer();
}

/** Sello genérico: círculo lleno con tilde, o círculo tenue. */
function circleStamp(size: number, fg: string, bg: string, filled: boolean): Buffer {
  const r = size / 2;
  const svg = filled
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <circle cx="${r}" cy="${r}" r="${r}" fill="${fg}"/>
        <path d="M${size * 0.3} ${size * 0.52} L${size * 0.44} ${size * 0.66} L${size * 0.71} ${size * 0.36}"
          fill="none" stroke="${bg}" stroke-width="${size * 0.09}" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <circle cx="${r}" cy="${r}" r="${r}" fill="${fg}" fill-opacity="${EMPTY_OPACITY}"/>
      </svg>`;
  return Buffer.from(svg);
}

export async function stripFiles(card: Card, merchant: Merchant): Promise<Files | null> {
  const required = merchant.stampsRequired;
  const filled = Math.min(card.currentStamps, required);
  const key = `${merchant.id}|${merchant.brandColor}|${merchant.stampIconUrl ?? ""}|${filled}/${required}`;

  const cached = stripCache.get(key);
  if (cached) return cached;

  const sharp = await loadSharp();
  if (!sharp) return null;

  try {
    const fg = contrastForeground(merchant.brandColor);
    const dark = fg !== "#FFFFFF";
    const icon = merchant.stampIconUrl ? await fetchImage(merchant.stampIconUrl) : null;
    const aspect = icon
      ? await sharp(icon).metadata().then((m) => (m.width && m.height ? m.width / m.height : 1))
      : 1;

    const boxes = stampLayout(required, STRIP_W, STRIP_H, aspect);
    const layers = await Promise.all(
      boxes.map(async (b, i) => {
        const isFilled = i < filled;
        const input = icon
          ? await stampFromIcon(sharp, icon, b.w, b.h, dark, isFilled ? 1 : EMPTY_OPACITY)
          : circleStamp(b.w, fg, merchant.brandColor, isFilled);
        return { input, left: b.x, top: b.y };
      }),
    );

    const full = await sharp({
      create: { width: STRIP_W, height: STRIP_H, channels: 4, background: merchant.brandColor },
    })
      .composite(layers)
      .png()
      .toBuffer();

    const files: Files = {
      "strip@3x.png": full,
      "strip@2x.png": await sharp(full).resize(750, 246).png().toBuffer(),
      "strip.png": await sharp(full).resize(375, 123).png().toBuffer(),
    };

    if (stripCache.size >= STRIP_CACHE_MAX) {
      stripCache.delete(stripCache.keys().next().value!);
    }
    stripCache.set(key, files);
    return files;
  } catch (error) {
    console.error("[apple-wallet] no se pudo dibujar la franja de sellos:", error);
    return null;
  }
}
