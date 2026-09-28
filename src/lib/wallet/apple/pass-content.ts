/**
 * Contenido del pass de Apple Wallet (el `pass.json`) — SPEC §8.2.
 *
 * Módulo puro: sin certificados ni I/O, así se puede testear entero. La firma y
 * el empaquetado del .pkpass los hace `apple.ts`.
 *
 * Referencia de claves: https://developer.apple.com/documentation/walletpasses/pass
 */
import { hasPrize, type Card, type Merchant } from "@/lib/domain/card";
import { contrastForeground } from "@/lib/color";

/** Último movimiento de la tarjeta: define el texto de la notificación. */
export type LastEvent = "stamp" | "redeem" | null;

export type PassField = {
  key: string;
  label?: string;
  value: string | number;
  changeMessage?: string;
  dataDetectorTypes?: string[];
  textAlignment?: string;
};

export type PassJson = {
  formatVersion: 1;
  passTypeIdentifier: string;
  teamIdentifier: string;
  serialNumber: string;
  organizationName: string;
  description: string;
  logoText: string;
  backgroundColor: string;
  foregroundColor: string;
  labelColor: string;
  sharingProhibited: boolean;
  webServiceURL?: string;
  authenticationToken?: string;
  barcodes: {
    format: "PKBarcodeFormatQR";
    message: string;
    messageEncoding: "iso-8859-1";
    altText: string;
  }[];
  locations?: { latitude: number; longitude: number; relevantText: string }[];
  storeCard: {
    headerFields: PassField[];
    primaryFields: PassField[];
    secondaryFields: PassField[];
    auxiliaryFields: PassField[];
    backFields: PassField[];
  };
};

export type PassContentInput = {
  card: Card;
  merchant: Merchant;
  /** `cards.apple_auth_token`: autentica al iPhone contra nuestro web service. */
  authToken: string;
  lastEvent: LastEvent;
  appUrl: string;
  passTypeId: string;
  teamId: string;
  /** Ubicación del café: iOS sugiere el pass en el lockscreen al llegar. */
  location?: { lat: number; lng: number } | null;
};

/** "#8B5E3C" → "rgb(139, 94, 60)". Apple solo acepta colores en formato rgb(). */
export function hexToRgb(hex: string): string {
  const [r, g, b] = parseHex(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Mezcla dos colores hex: t=0 devuelve `a`, t=1 devuelve `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const [r, g, bl] = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgb(${r}, ${g}, ${bl})`;
}

function parseHex(hex: string): [number, number, number] {
  let raw = hex.replace("#", "").trim();
  if (raw.length === 3) raw = raw.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return [45, 45, 45]; // #2D2D2D, fallback
  const int = parseInt(raw, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** Qué variante del logo usar: trazo claro sobre fondos oscuros y viceversa. */
export function logoVariantFor(brandColor: string): "light" | "dark" {
  return contrastForeground(brandColor) === "#FFFFFF" ? "light" : "dark";
}

/**
 * Texto de la notificación que muestra iOS cuando se actualiza el pass.
 * Apple exige que contenga `%@`, que se reemplaza por el valor nuevo del campo.
 */
export function stampsChangeMessage(
  merchantName: string,
  lastEvent: LastEvent,
  prizeReady: boolean,
): string {
  if (lastEvent === "redeem") {
    return `🎁 Canjeaste tu premio en ${merchantName}. Ahora vas %@`;
  }
  if (prizeReady) {
    return `🎉 ¡Completaste tu tarjeta en ${merchantName}! %@ — pedí tu premio`;
  }
  return `☕ Nuevo sello en ${merchantName}: %@`;
}

export function buildPassJson(input: PassContentInput): PassJson {
  const { card, merchant, authToken, lastEvent, appUrl, passTypeId, teamId, location } =
    input;

  const prizeReady = hasPrize(card, merchant);
  const current = card.currentStamps;
  const required = merchant.stampsRequired;

  const fg = contrastForeground(merchant.brandColor);

  // iOS solo registra el pass contra un web service HTTPS. En local (http) se
  // omite: el pass se puede agregar, pero no se actualiza solo.
  const webService = appUrl.startsWith("https://")
    ? { webServiceURL: `${appUrl}/api/apple-wallet`, authenticationToken: authToken }
    : {};

  const auxiliaryFields: PassField[] =
    card.prizesRedeemed > 0
      ? [{ key: "redeemed", label: "PREMIOS CANJEADOS", value: card.prizesRedeemed }]
      : [];

  return {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: card.id,
    organizationName: merchant.name,
    description: `Tarjeta de sellos de ${merchant.name}`,
    logoText: merchant.name,
    backgroundColor: hexToRgb(merchant.brandColor),
    foregroundColor: hexToRgb(fg),
    labelColor: mixHex(fg, merchant.brandColor, 0.3),
    // La tarjeta es personal: compartirla le daría el mismo QR a otra persona.
    sharingProhibited: true,
    ...webService,
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: card.qrToken,
        messageEncoding: "iso-8859-1",
        altText: "Mostralo al pagar",
      },
    ],
    ...(location
      ? {
          locations: [
            {
              latitude: location.lat,
              longitude: location.lng,
              relevantText: prizeReady
                ? `🎉 Tenés un premio esperándote en ${merchant.name}`
                : `☕ Sumá un sello en ${merchant.name}`,
            },
          ],
        }
      : {}),
    storeCard: {
      headerFields: [{ key: "stamps", label: "SELLOS", value: `${current}/${required}` }],
      // La notificación va en el campo principal: en un iPhone real
      // (2026-09-28), con el changeMessage en headerFields el pass se
      // actualizaba pero iOS no mostraba ninguna notificación.
      primaryFields: [
        {
          key: "progress",
          ...(prizeReady
            ? { label: "🎉 PREMIO DISPONIBLE", value: merchant.prizeDescription }
            : { label: "TU PROGRESO", value: `${current} de ${required} sellos` }),
          changeMessage: stampsChangeMessage(merchant.name, lastEvent, prizeReady),
        },
      ],
      secondaryFields: [
        prizeReady
          ? { key: "prize", label: "CÓMO CANJEARLO", value: "Mostrá este QR al pagar" }
          : { key: "prize", label: "PREMIO", value: merchant.prizeDescription },
      ],
      auxiliaryFields,
      backFields: [
        {
          key: "how",
          label: "¿Cómo funciona?",
          value:
            `Mostrá el QR de esta tarjeta cada vez que pagues en ${merchant.name}. ` +
            `Con ${required} sellos te llevás: ${merchant.prizeDescription}. ` +
            `La tarjeta se actualiza sola.`,
        },
        {
          key: "mi",
          label: "Tu WAFI",
          value: `${appUrl}/mi`,
          dataDetectorTypes: ["PKDataDetectorTypeLink"],
        },
      ],
    },
  };
}
