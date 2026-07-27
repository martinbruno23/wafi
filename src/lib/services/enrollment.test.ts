import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enrollCustomer, normalizeEmail, EnrollmentError } from "./enrollment";

type Result = { data: unknown; error: { message: string } | null };

type QueryState = {
  table: string;
  op: "select" | "upsert";
  payload?: Record<string, unknown>;
};

type Script = (state: QueryState) => Result;

/**
 * Mock mínimo del query builder de Supabase: encadena select/eq/upsert y
 * resuelve con lo que devuelva `script` (por tabla y operación).
 */
function createMockClient(script: Script) {
  const upserts: { table: string; payload: Record<string, unknown> }[] = [];

  const from = (table: string) => {
    const state: QueryState = { table, op: "select" };

    const builder = {
      select: () => builder,
      eq: () => builder,
      upsert: (payload: Record<string, unknown>) => {
        state.op = "upsert";
        state.payload = payload;
        upserts.push({ table, payload });
        return builder;
      },
      single: () => Promise.resolve(script(state)),
      maybeSingle: () => Promise.resolve(script(state)),
      then: (
        resolve: (value: Result) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(script(state)).then(resolve, reject),
    };

    return builder;
  };

  return { client: { from } as unknown as SupabaseClient, upserts };
}

const MERCHANT_ROW = {
  id: "m1",
  slug: "cafe-prueba",
  name: "Café de Prueba",
  brand_color: "#8B5E3C",
  stamps_required: 5,
  prize_description: "Café gratis",
  logo_url: null,
  is_active: true,
};

const CARD_ROW = {
  id: "card1",
  customer_id: "c1",
  merchant_id: "m1",
  qr_token: "tok123",
  current_stamps: 0,
  total_stamps: 0,
  prizes_redeemed: 0,
};

/** Camino feliz: comercio existe, cliente nuevo, card nueva. */
const happyScript: Script = ({ table, op }) => {
  if (table === "merchants") return { data: MERCHANT_ROW, error: null };
  if (table === "customers") return { data: { id: "c1" }, error: null };
  if (table === "cards" && op === "upsert") return { data: [CARD_ROW], error: null };
  return { data: CARD_ROW, error: null };
};

describe("normalizeEmail", () => {
  it("recorta espacios y pasa a minúsculas", () => {
    expect(normalizeEmail("  Martin@Gmail.COM ")).toBe("martin@gmail.com");
  });
});

describe("enrollCustomer", () => {
  it("crea la tarjeta y marca existing=false", async () => {
    const { client } = createMockClient(happyScript);
    const result = await enrollCustomer("cafe-prueba", "martin@gmail.com", client);

    expect(result.existing).toBe(false);
    expect(result.card.id).toBe("card1");
    expect(result.card.currentStamps).toBe(0);
    expect(result.merchant.slug).toBe("cafe-prueba");
    expect(result.merchant.stampsRequired).toBe(5);
  });

  it("normaliza el email antes de guardarlo", async () => {
    const { client, upserts } = createMockClient(happyScript);
    await enrollCustomer("cafe-prueba", "  MARTIN@Gmail.com  ", client);

    const customerUpsert = upserts.find((u) => u.table === "customers");
    expect(customerUpsert?.payload).toEqual({ email: "martin@gmail.com" });
  });

  it("no duplica la tarjeta si el cliente ya estaba enrolado (existing=true)", async () => {
    // El upsert con ignoreDuplicates devuelve [] → se busca la card existente.
    const script: Script = ({ table, op }) => {
      if (table === "merchants") return { data: MERCHANT_ROW, error: null };
      if (table === "customers") return { data: { id: "c1" }, error: null };
      if (table === "cards" && op === "upsert") return { data: [], error: null };
      return { data: { ...CARD_ROW, current_stamps: 3 }, error: null };
    };

    const { client } = createMockClient(script);
    const result = await enrollCustomer("cafe-prueba", "martin@gmail.com", client);

    expect(result.existing).toBe(true);
    expect(result.card.currentStamps).toBe(3);
  });

  it("falla con MERCHANT_NOT_FOUND si el slug no existe", async () => {
    const script: Script = ({ table }) =>
      table === "merchants"
        ? { data: null, error: null }
        : { data: null, error: null };

    const { client } = createMockClient(script);
    await expect(
      enrollCustomer("no-existe", "martin@gmail.com", client),
    ).rejects.toMatchObject({ code: "MERCHANT_NOT_FOUND" });
  });

  it("falla con MERCHANT_NOT_FOUND si el comercio está inactivo", async () => {
    // La query filtra is_active=true, así que un comercio inactivo no devuelve fila.
    const script: Script = () => ({ data: null, error: null });
    const { client } = createMockClient(script);

    await expect(
      enrollCustomer("cafe-inactivo", "martin@gmail.com", client),
    ).rejects.toBeInstanceOf(EnrollmentError);
  });

  it("propaga errores de base como DB_ERROR", async () => {
    const script: Script = ({ table }) =>
      table === "merchants"
        ? { data: null, error: { message: "connection refused" } }
        : { data: null, error: null };

    const { client } = createMockClient(script);
    await expect(
      enrollCustomer("cafe-prueba", "martin@gmail.com", client),
    ).rejects.toMatchObject({ code: "DB_ERROR" });
  });
});
