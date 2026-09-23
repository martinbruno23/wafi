import { describe, it, expect } from "vitest";
import {
  buildPassJson,
  hexToRgb,
  mixHex,
  logoVariantFor,
  stampsChangeMessage,
  type PassContentInput,
} from "./pass-content";
import type { Card, Merchant } from "@/lib/domain/card";

const merchant: Merchant = {
  id: "m1",
  slug: "cafe-prueba",
  name: "Café de Prueba",
  brandColor: "#8B5E3C",
  stampsRequired: 5,
  prizeDescription: "Café gratis",
  logoUrl: null,
  isActive: true,
  googleClassId: null,
};

const card: Card = {
  id: "card-uuid-1",
  customerId: "c1",
  merchantId: "m1",
  qrToken: "qr-token-abc",
  currentStamps: 3,
  totalStamps: 3,
  prizesRedeemed: 0,
  googleObjectId: null,
};

const base: PassContentInput = {
  card,
  merchant,
  authToken: "0123456789abcdef0123456789abcdef",
  lastEvent: "stamp",
  appUrl: "https://wafi-iota.vercel.app",
  passTypeId: "pass.app.wafi.card",
  teamId: "ABCDE12345",
};

describe("colores", () => {
  it("convierte hex a rgb()", () => {
    expect(hexToRgb("#8B5E3C")).toBe("rgb(139, 94, 60)");
    expect(hexToRgb("#fff")).toBe("rgb(255, 255, 255)");
  });

  it("hex inválido cae en el casi-negro del design system", () => {
    expect(hexToRgb("marron")).toBe("rgb(45, 45, 45)");
  });

  it("mezcla dos colores", () => {
    expect(mixHex("#000000", "#FFFFFF", 0)).toBe("rgb(0, 0, 0)");
    expect(mixHex("#000000", "#FFFFFF", 1)).toBe("rgb(255, 255, 255)");
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("rgb(128, 128, 128)");
  });

  it("elige el logo claro sobre fondos oscuros y el oscuro sobre claros", () => {
    expect(logoVariantFor("#8B5E3C")).toBe("light");
    expect(logoVariantFor("#F2D48A")).toBe("dark");
  });
});

describe("stampsChangeMessage", () => {
  it("siempre incluye %@, que Apple exige", () => {
    for (const ev of ["stamp", "redeem", null] as const) {
      for (const prize of [true, false]) {
        expect(stampsChangeMessage("X", ev, prize)).toContain("%@");
      }
    }
  });

  it("distingue sello, tarjeta completa y canje", () => {
    expect(stampsChangeMessage("Batata", "stamp", false)).toMatch(/Nuevo sello en Batata/);
    expect(stampsChangeMessage("Batata", "stamp", true)).toMatch(/Completaste/);
    expect(stampsChangeMessage("Batata", "redeem", false)).toMatch(/Canjeaste/);
  });
});

describe("buildPassJson", () => {
  it("arma la identidad del pass", () => {
    const p = buildPassJson(base);
    expect(p.formatVersion).toBe(1);
    expect(p.serialNumber).toBe("card-uuid-1");
    expect(p.passTypeIdentifier).toBe("pass.app.wafi.card");
    expect(p.teamIdentifier).toBe("ABCDE12345");
    expect(p.organizationName).toBe("Café de Prueba");
    expect(p.sharingProhibited).toBe(true);
  });

  it("usa el color del café con texto de contraste", () => {
    const p = buildPassJson(base);
    expect(p.backgroundColor).toBe("rgb(139, 94, 60)");
    expect(p.foregroundColor).toBe("rgb(255, 255, 255)");
  });

  it("el QR lleva el qr_token de la tarjeta", () => {
    const [bc] = buildPassJson(base).barcodes;
    expect(bc.format).toBe("PKBarcodeFormatQR");
    expect(bc.message).toBe("qr-token-abc");
  });

  it("muestra el progreso sin premio", () => {
    const p = buildPassJson(base).storeCard;
    expect(p.headerFields[0].value).toBe("3/5");
    expect(p.primaryFields[0]).toMatchObject({ label: "TU PROGRESO", value: "3 de 5 sellos" });
    expect(p.secondaryFields[0]).toMatchObject({ label: "PREMIO", value: "Café gratis" });
  });

  it("destaca el premio cuando la tarjeta está completa", () => {
    const p = buildPassJson({ ...base, card: { ...card, currentStamps: 5 } }).storeCard;
    expect(p.primaryFields[0]).toMatchObject({
      label: "🎉 PREMIO DISPONIBLE",
      value: "Café gratis",
    });
    expect(p.headerFields[0].changeMessage).toMatch(/Completaste/);
  });

  it("cuenta los premios canjeados solo si hay alguno", () => {
    expect(buildPassJson(base).storeCard.auxiliaryFields).toEqual([]);
    const withRedeems = buildPassJson({ ...base, card: { ...card, prizesRedeemed: 2 } });
    expect(withRedeems.storeCard.auxiliaryFields[0]).toMatchObject({ value: 2 });
  });

  it("registra el web service solo con HTTPS", () => {
    const prod = buildPassJson(base);
    expect(prod.webServiceURL).toBe("https://wafi-iota.vercel.app/api/apple-wallet");
    expect(prod.authenticationToken).toBe(base.authToken);

    const local = buildPassJson({ ...base, appUrl: "http://localhost:3000" });
    expect(local.webServiceURL).toBeUndefined();
    expect(local.authenticationToken).toBeUndefined();
  });

  it("agrega la ubicación del café solo si la tiene", () => {
    expect(buildPassJson(base).locations).toBeUndefined();
    const withLoc = buildPassJson({ ...base, location: { lat: -34.66, lng: -58.36 } });
    expect(withLoc.locations?.[0]).toMatchObject({ latitude: -34.66, longitude: -58.36 });
  });

  it("el reverso linkea a /mi", () => {
    const back = buildPassJson(base).storeCard.backFields;
    expect(back.find((f) => f.key === "mi")?.value).toBe("https://wafi-iota.vercel.app/mi");
  });
});
