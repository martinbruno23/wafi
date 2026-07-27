import { describe, it, expect } from "vitest";
import {
  hasPrize,
  maskEmail,
  toScanState,
  type Card,
  type Merchant,
  type Customer,
} from "./card";

describe("hasPrize", () => {
  it("no hay premio con menos sellos que los requeridos", () => {
    expect(hasPrize({ currentStamps: 9 }, { stampsRequired: 10 })).toBe(false);
  });

  it("hay premio justo en el límite", () => {
    expect(hasPrize({ currentStamps: 10 }, { stampsRequired: 10 })).toBe(true);
  });

  it("hay premio por encima del límite (el cliente siguió comprando)", () => {
    expect(hasPrize({ currentStamps: 13 }, { stampsRequired: 10 })).toBe(true);
  });

  it("no hay premio en una tarjeta recién creada", () => {
    expect(hasPrize({ currentStamps: 0 }, { stampsRequired: 5 })).toBe(false);
  });
});

describe("maskEmail", () => {
  it("deja visibles los 3 primeros caracteres del local", () => {
    expect(maskEmail("martin@gmail.com")).toBe("mar***@gmail.com");
  });

  it("enmascara por completo los locales cortos", () => {
    expect(maskEmail("ab@x.com")).toBe("***@x.com");
    expect(maskEmail("abc@x.com")).toBe("***@x.com");
  });

  it("muestra 3 caracteres apenas el local tiene 4", () => {
    expect(maskEmail("abcd@x.com")).toBe("abc***@x.com");
  });

  it("maneja emails largos con subdominios", () => {
    expect(maskEmail("martin.bruno@mail.empresa.com.ar")).toBe(
      "mar***@mail.empresa.com.ar",
    );
  });

  it("usa la última arroba cuando hay más de una", () => {
    expect(maskEmail("raro@cosa@gmail.com")).toBe("rar***@gmail.com");
  });

  it("devuelve *** si no es un email válido", () => {
    expect(maskEmail("sinArroba")).toBe("***");
    expect(maskEmail("@empiezaConArroba.com")).toBe("***");
  });
});

describe("toScanState", () => {
  const merchant: Merchant = {
    id: "m1",
    slug: "cafe-prueba",
    name: "Café de Prueba",
    brandColor: "#8B5E3C",
    stampsRequired: 10,
    prizeDescription: "Café gratis",
    logoUrl: null,
    isActive: true,
  };

  const customer: Customer = { id: "c1", email: "martin@gmail.com" };

  const card: Card = {
    id: "card1",
    customerId: "c1",
    merchantId: "m1",
    qrToken: "abc123",
    currentStamps: 7,
    totalStamps: 7,
    prizesRedeemed: 0,
  };

  it("arma el estado completo sin premio", () => {
    expect(toScanState(card, merchant, customer)).toEqual({
      cardId: "card1",
      customerEmailMasked: "mar***@gmail.com",
      currentStamps: 7,
      stampsRequired: 10,
      hasPrize: false,
      prizeDescription: "Café gratis",
    });
  });

  it("marca hasPrize cuando la tarjeta está completa", () => {
    const full = { ...card, currentStamps: 10 };
    expect(toScanState(full, merchant, customer).hasPrize).toBe(true);
  });

  it("nunca expone el qr_token ni el email completo", () => {
    const state = toScanState(card, merchant, customer);
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("abc123");
    expect(serialized).not.toContain("martin@gmail.com");
  });
});
