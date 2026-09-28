import { describe, it, expect, vi } from "vitest";

// Simula lo que pasó en Vercel (2026-09-28): el módulo nativo de sharp no carga.
vi.mock("sharp", () => {
  throw new Error("Could not load the \"sharp\" module using the linux-x64 runtime");
});

const { logoFiles, iconFiles, stripFiles } = await import("./images");
const { APPLE_ICON_FILES, APPLE_LOGO_FILES } = await import("./assets.generated");
import type { Card, Merchant } from "@/lib/domain/card";

const merchant: Merchant = {
  id: "m1",
  slug: "batata-demo",
  name: "Batata Cofi",
  brandColor: "#7B2D3B",
  stampsRequired: 5,
  prizeDescription: "Premio",
  logoUrl: "https://example.com/logo.png",
  coverUrl: null,
  programName: null,
  logoWideUrl: "https://example.com/logo-wide.png",
  stampIconUrl: "https://example.com/stamp.png",
  isActive: true,
  googleClassId: null,
};

const card: Card = {
  id: "c1",
  customerId: "u1",
  merchantId: "m1",
  qrToken: "q",
  currentStamps: 3,
  totalStamps: 3,
  prizesRedeemed: 0,
  googleObjectId: null,
};

describe("imágenes del pass sin sharp", () => {
  it("el logo cae en el de WAFI, sin tumbar el pass", async () => {
    const logo = await logoFiles(merchant);
    expect(logo.wide).toBe(false);
    expect(logo.files["logo.png"].toString("base64")).toBe(APPLE_LOGO_FILES.light["logo.png"]);
  });

  it("el ícono cae en el de WAFI", async () => {
    const icon = await iconFiles(merchant);
    expect(icon["icon.png"].toString("base64")).toBe(APPLE_ICON_FILES["icon.png"]);
  });

  it("sin franja: el pass vuelve a mostrar el progreso en texto", async () => {
    expect(await stripFiles(card, merchant)).toBeNull();
  });
});
