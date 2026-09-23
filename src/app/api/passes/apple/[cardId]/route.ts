import { isAppleWalletConfigured } from "@/lib/env";
import { apiError } from "@/lib/api/response";
import {
  loadApplePassData,
  renderApplePass,
  tokensMatch,
} from "@/lib/services/apple-pass";

/**
 * GET /api/passes/apple/[cardId]?t={apple_auth_token} — descarga del .pkpass.
 *
 * Lo abre Safari en el iPhone desde la landing de alta: al recibir el
 * Content-Type de pkpass, iOS muestra el sheet nativo "Agregar a Apple Wallet".
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  if (!isAppleWalletConfigured()) {
    return apiError("APPLE_NOT_CONFIGURED", "Apple Wallet todavía no está disponible.", 503);
  }

  const { cardId } = await params;
  const token = new URL(request.url).searchParams.get("t") ?? "";

  const data = await loadApplePassData(cardId);
  // Mismo 404 para "no existe" y "token incorrecto": no revelamos qué cardIds existen.
  if (!data || !tokensMatch(token, data.authToken)) {
    return apiError("PASS_NOT_FOUND", "No encontramos esta tarjeta.", 404);
  }

  try {
    const pkpass = renderApplePass(data);
    return new Response(new Uint8Array(pkpass), {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="wafi-${data.merchant.slug}.pkpass"`,
        "Last-Modified": data.updatedAt.toUTCString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[apple-wallet] no se pudo generar el pass:", error);
    return apiError("PASS_ERROR", "No pudimos generar tu tarjeta. Probá de nuevo.", 500);
  }
}
