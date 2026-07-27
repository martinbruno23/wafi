import { describe, it, expect } from "vitest";
import { contrastForeground } from "./color";

describe("contrastForeground", () => {
  it("texto blanco sobre marrones y oscuros", () => {
    expect(contrastForeground("#8B5E3C")).toBe("#FFFFFF"); // marrón café
    expect(contrastForeground("#2D2D2D")).toBe("#FFFFFF");
    expect(contrastForeground("#000000")).toBe("#FFFFFF");
  });

  it("texto oscuro sobre claros", () => {
    expect(contrastForeground("#FAFAF8")).toBe("#1A1A1A");
    expect(contrastForeground("#FFD700")).toBe("#1A1A1A"); // dorado
    expect(contrastForeground("#FFFFFF")).toBe("#1A1A1A");
  });

  it("acepta shorthand de 3 dígitos", () => {
    expect(contrastForeground("#fff")).toBe("#1A1A1A");
    expect(contrastForeground("#333")).toBe("#FFFFFF");
  });

  it("hex inválido cae en blanco (fondo fallback oscuro)", () => {
    expect(contrastForeground("naranja")).toBe("#FFFFFF");
    expect(contrastForeground("")).toBe("#FFFFFF");
  });
});
