import "server-only";

/**
 * Acceso a variables de entorno del servidor con error claro si falta alguna.
 * Se leen en el momento de uso (no al importar) para que el build no falle
 * cuando una integración todavía no está configurada.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Revisá .env.local (y las env vars en Vercel).`,
    );
  }
  return value;
}

/** URL pública de producción: la usan los servicios externos que necesitan
 *  descargar assets nuestros (Google Wallet baja el logo del pass). */
const PRODUCTION_URL = "https://wafi-iota.vercel.app";

export const env = {
  get appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  },
  /**
   * Base para assets que tienen que ser alcanzables desde afuera.
   * En desarrollo `appUrl` es localhost, que Google no puede resolver: en ese
   * caso se usa la URL de producción.
   */
  get publicAssetsUrl(): string {
    const url = this.appUrl;
    return url.includes("localhost") || url.includes("127.0.0.1")
      ? PRODUCTION_URL
      : url;
  },
  get googleIssuerId(): string {
    return required("GOOGLE_WALLET_ISSUER_ID");
  },
  get googleSaEmail(): string {
    return required("GOOGLE_SA_EMAIL");
  },
  /** La private key viaja con `\n` escapados en el .env: hay que restaurarlos. */
  get googleSaPrivateKey(): string {
    return required("GOOGLE_SA_PRIVATE_KEY").replace(/\\n/g, "\n");
  },
};

/** true si la integración con Google Wallet está configurada. */
export function isGoogleWalletConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_WALLET_ISSUER_ID &&
      process.env.GOOGLE_SA_EMAIL &&
      process.env.GOOGLE_SA_PRIVATE_KEY,
  );
}
