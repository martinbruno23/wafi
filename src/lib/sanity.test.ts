import { describe, it, expect } from "vitest";

// Smoke test: confirma que el harness de Vitest corre. Se reemplaza por los
// tests de dominio en la Etapa 1.
describe("sanity", () => {
  it("corre el harness de tests", () => {
    expect(1 + 1).toBe(2);
  });
});
