import { describe, it, expect, beforeAll } from "vitest";
import { loyaltyClassBody } from "./google";
import type { Merchant } from "@/lib/domain/card";

beforeAll(() => {
  process.env.GOOGLE_WALLET_ISSUER_ID = "3388000000000000000";
  process.env.NEXT_PUBLIC_APP_URL = "https://wafi-iota.vercel.app";
});

const batata: Merchant = {
  id: "m1",
  slug: "batata-demo",
  name: "Batata Cofi",
  brandColor: "#7B2D3B",
  stampsRequired: 5,
  prizeDescription: "Tu premio",
  logoUrl: "https://wafi-iota.vercel.app/demo/batata/logo.png",
  coverUrl: "https://wafi-iota.vercel.app/demo/batata/hero.png",
  programName: "Batateros Club",
  isActive: true,
  googleClassId: null,
};

describe("loyaltyClassBody", () => {
  it("la tarjeta lleva la marca del café, no la de WAFI", () => {
    const body = loyaltyClassBody(batata);
    expect(body.issuerName).toBe("Batata Cofi");
    expect(body.programName).toBe("Batateros Club");
    expect(body.hexBackgroundColor).toBe("#7B2D3B");
    expect(body.programLogo.sourceUri.uri).toBe(batata.logoUrl);
    expect(JSON.stringify(body)).not.toMatch(/WAFI/);
  });

  it("usa el banner del café si tiene", () => {
    expect(loyaltyClassBody(batata).heroImage?.sourceUri.uri).toBe(batata.coverUrl);
    expect(loyaltyClassBody({ ...batata, coverUrl: null }).heroImage).toBeUndefined();
  });

  it("sin nombre de programa, el título es el nombre del café", () => {
    expect(loyaltyClassBody({ ...batata, programName: null }).programName).toBe("Batata Cofi");
  });

  it("sin logo propio cae en el de WAFI, con una URL pública", () => {
    const body = loyaltyClassBody({ ...batata, logoUrl: null });
    expect(body.programLogo.sourceUri.uri).toBe("https://wafi-iota.vercel.app/wafi-logo.png");
  });

  it("el id de la clase es por comercio", () => {
    expect(loyaltyClassBody(batata).id).toBe("3388000000000000000.batata-demo");
  });
});
