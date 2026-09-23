import { env, isAppleWalletConfigured } from "@/lib/env";
import { registeredPassesFor } from "@/lib/services/apple-registrations";
import { updatedSerials } from "@/lib/wallet/apple/web-service";

/**
 * GET ?passesUpdatedSince={tag} — el iPhone pregunta qué passes suyos cambiaron.
 * Lo hace al recibir un push nuestro. Sin autenticación: así lo define Apple
 * (solo devuelve serials, que sin su token no sirven para nada).
 * 200 { serialNumbers, lastUpdated } · 204 sin cambios.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ deviceId: string; passTypeId: string }> },
) {
  const { deviceId, passTypeId } = await params;
  if (!isAppleWalletConfigured() || passTypeId !== env.applePassTypeId) {
    return new Response(null, { status: 404 });
  }

  const since = new URL(request.url).searchParams.get("passesUpdatedSince");

  try {
    const result = updatedSerials(await registeredPassesFor(deviceId), since);
    if (!result) return new Response(null, { status: 204 });
    return Response.json(result);
  } catch (error) {
    console.error("[apple-wallet] no se pudieron listar los passes:", error);
    return new Response(null, { status: 500 });
  }
}
