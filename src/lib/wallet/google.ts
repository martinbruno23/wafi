import "server-only";
import { GoogleAuth } from "google-auth-library";
import jwt from "jsonwebtoken";
import { env } from "@/lib/env";
import { hasPrize, type Card, type Merchant, type Customer } from "@/lib/domain/card";

/**
 * Integración con Google Wallet — SPEC §8.1.
 *
 * Modelo: una LoyaltyClass por comercio (el "programa") y un LoyaltyObject por
 * tarjeta (el pass del cliente). El objeto es una proyección de solo lectura
 * del estado del backend; cada sellado lo actualiza con un PATCH y Google se
 * encarga de pushearlo al teléfono.
 */

const BASE = "https://walletobjects.googleapis.com/walletobjects/v1";

let authClient: GoogleAuth | null = null;

function auth(): GoogleAuth {
  authClient ??= new GoogleAuth({
    credentials: {
      client_email: env.googleSaEmail,
      private_key: env.googleSaPrivateKey,
    },
    scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"],
  });
  return authClient;
}

/** IDs: el prefijo del issuer es obligatorio en la API de Google. */
export function classIdFor(merchantSlug: string): string {
  return `${env.googleIssuerId}.${merchantSlug}`;
}

export function objectIdFor(cardId: string): string {
  return `${env.googleIssuerId}.${cardId}`;
}

type RequestError = {
  response?: { status?: number; data?: { error?: { message?: string } } };
  message?: string;
};

function statusOf(error: unknown): number | undefined {
  return (error as RequestError)?.response?.status;
}

function messageOf(error: unknown): string {
  const e = error as RequestError;
  return e?.response?.data?.error?.message ?? e?.message ?? "error desconocido";
}

/** Texto del progreso que se ve en el pass: "3 de 10 sellos". */
function balanceText(card: Card, merchant: Merchant): string {
  return `${card.currentStamps} de ${merchant.stampsRequired} sellos`;
}

function loyaltyClassBody(merchant: Merchant) {
  // Google rechaza la clase sin programLogo, así que los comercios que todavía
  // no cargaron el suyo usan el logo de WAFI. La URL tiene que ser pública:
  // Google la descarga desde sus servidores (no sirve localhost).
  const logoUri = merchant.logoUrl ?? `${env.publicAssetsUrl}/wafi-logo.png`;

  return {
    id: classIdFor(merchant.slug),
    issuerName: "WAFI",
    programName: merchant.name,
    reviewStatus: "UNDER_REVIEW",
    hexBackgroundColor: merchant.brandColor,
    programLogo: {
      sourceUri: { uri: logoUri },
      contentDescription: {
        defaultValue: {
          language: "es-AR",
          value: merchant.logoUrl ? `Logo de ${merchant.name}` : "Logo de WAFI",
        },
      },
    },
  };
}

/**
 * Crea (o actualiza) la LoyaltyClass del comercio. Idempotente.
 * Devuelve el classId.
 */
export async function ensureLoyaltyClass(merchant: Merchant): Promise<string> {
  const client = await auth().getClient();
  const id = classIdFor(merchant.slug);

  try {
    await client.request({ url: `${BASE}/loyaltyClass/${id}` });
    // Ya existe: la actualizamos por si cambió el branding.
    await client.request({
      url: `${BASE}/loyaltyClass/${id}`,
      method: "PATCH",
      data: loyaltyClassBody(merchant),
    });
    return id;
  } catch (error) {
    if (statusOf(error) !== 404) {
      throw new Error(`No se pudo leer la LoyaltyClass: ${messageOf(error)}`);
    }
  }

  await client.request({
    url: `${BASE}/loyaltyClass`,
    method: "POST",
    data: loyaltyClassBody(merchant),
  });
  return id;
}

function loyaltyObjectBody(card: Card, merchant: Merchant, customerEmail?: string) {
  const prizeReady = hasPrize(card, merchant);

  return {
    id: objectIdFor(card.id),
    classId: classIdFor(merchant.slug),
    state: "ACTIVE",
    accountId: card.id,
    accountName: customerEmail ?? "Cliente WAFI",
    loyaltyPoints: {
      label: "Sellos",
      balance: { string: balanceText(card, merchant) },
    },
    barcode: {
      type: "QR_CODE",
      value: card.qrToken,
      alternateText: "Mostrá este código",
    },
    textModulesData: [
      {
        id: "prize",
        header: prizeReady ? "🎉 Premio disponible" : "Tu premio",
        body: merchant.prizeDescription,
      },
    ],
    linksModuleData: {
      uris: [
        {
          id: "wafi",
          uri: `${env.appUrl}/mi`,
          description: "Ver mi WAFI",
        },
      ],
    },
  };
}

/** Crea el LoyaltyObject de una tarjeta. Devuelve el objectId. */
export async function createLoyaltyObject(
  card: Card,
  merchant: Merchant,
  customer?: Pick<Customer, "email">,
): Promise<string> {
  const client = await auth().getClient();
  const id = objectIdFor(card.id);

  try {
    await client.request({
      url: `${BASE}/loyaltyObject`,
      method: "POST",
      data: loyaltyObjectBody(card, merchant, customer?.email),
    });
  } catch (error) {
    // 409: ya existía (por ejemplo, se reintentó el alta). No es un problema.
    if (statusOf(error) !== 409) {
      throw new Error(`No se pudo crear el pass: ${messageOf(error)}`);
    }
  }

  return id;
}

/** Refleja el estado actual de la tarjeta en el pass. Google pushea al teléfono. */
export async function updateLoyaltyObject(
  card: Card,
  merchant: Merchant,
): Promise<void> {
  const client = await auth().getClient();
  const prizeReady = hasPrize(card, merchant);

  await client.request({
    url: `${BASE}/loyaltyObject/${objectIdFor(card.id)}`,
    method: "PATCH",
    data: {
      loyaltyPoints: {
        label: "Sellos",
        balance: { string: balanceText(card, merchant) },
      },
      textModulesData: [
        {
          id: "prize",
          header: prizeReady ? "🎉 Premio disponible" : "Tu premio",
          body: merchant.prizeDescription,
        },
      ],
    },
  });
}

/**
 * Link "Guardar en Google Wallet": un JWT firmado con la service account que
 * referencia el objeto ya creado.
 */
export function buildSaveUrl(objectId: string): string {
  const token = jwt.sign(
    {
      iss: env.googleSaEmail,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      payload: { loyaltyObjects: [{ id: objectId }] },
    },
    env.googleSaPrivateKey,
    { algorithm: "RS256" },
  );

  return `https://pay.google.com/gp/v/save/${token}`;
}
