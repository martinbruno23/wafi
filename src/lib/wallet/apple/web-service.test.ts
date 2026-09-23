import { describe, it, expect } from "vitest";
import {
  isValidSerial,
  parseApplePassAuth,
  updatedSerials,
  isNotModified,
} from "./web-service";

describe("isValidSerial", () => {
  it("acepta UUIDs y rechaza cualquier otra cosa", () => {
    expect(isValidSerial("56cb67f6-35cd-4f2b-81c3-f42e522db463")).toBe(true);
    expect(isValidSerial("56cb67f6")).toBe(false);
    expect(isValidSerial("'; drop table cards; --")).toBe(false);
  });
});

describe("parseApplePassAuth", () => {
  it("extrae el token del header de Apple", () => {
    expect(parseApplePassAuth("ApplePass abc123")).toBe("abc123");
  });

  it("rechaza otros esquemas o headers vacíos", () => {
    expect(parseApplePassAuth(null)).toBeNull();
    expect(parseApplePassAuth("")).toBeNull();
    expect(parseApplePassAuth("Bearer abc123")).toBeNull();
    expect(parseApplePassAuth("ApplePass")).toBeNull();
  });
});

describe("updatedSerials", () => {
  const t = (s: string) => new Date(s);
  const passes = [
    { serial: "a", updatedAt: t("2026-09-23T10:00:00.000Z") },
    { serial: "b", updatedAt: t("2026-09-23T12:00:00.000Z") },
  ];

  it("sin tag previo devuelve todos", () => {
    expect(updatedSerials(passes, null)).toEqual({
      serialNumbers: ["a", "b"],
      lastUpdated: String(t("2026-09-23T12:00:00.000Z").getTime()),
    });
  });

  it("devuelve solo los que cambiaron después del tag", () => {
    const since = String(t("2026-09-23T11:00:00.000Z").getTime());
    expect(updatedSerials(passes, since)?.serialNumbers).toEqual(["b"]);
  });

  it("devuelve null si no hay cambios (→ 204)", () => {
    const since = String(t("2026-09-23T12:00:00.000Z").getTime());
    expect(updatedSerials(passes, since)).toBeNull();
    expect(updatedSerials([], null)).toBeNull();
  });

  it("un tag que no reconocemos se trata como primera consulta", () => {
    expect(updatedSerials(passes, "basura")?.serialNumbers).toEqual(["a", "b"]);
  });
});

describe("isNotModified", () => {
  const updated = new Date("2026-09-23T12:00:00.500Z");

  it("304 si el iPhone ya tiene esta versión", () => {
    expect(isNotModified(updated, "Wed, 23 Sep 2026 12:00:00 GMT")).toBe(true);
  });

  it("hay que mandar el pass si cambió después", () => {
    expect(isNotModified(updated, "Wed, 23 Sep 2026 11:59:59 GMT")).toBe(false);
  });

  it("sin header o con un header roto, siempre se manda", () => {
    expect(isNotModified(updated, null)).toBe(false);
    expect(isNotModified(updated, "ayer")).toBe(false);
  });
});
