import { authorizeApplePass } from "@/lib/services/apple-registrations";
import { renderApplePass } from "@/lib/services/apple-pass";
import { isNotModified } from "@/lib/wallet/apple/web-service";

/**
 * GET — el iPhone baja la versión actual del pass (después de un push).
 * 200 con el .pkpass · 304 si ya tiene la última · 401 no autorizado.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ passTypeId: string; serial: string }> },
) {
  const { passTypeId, serial } = await params;

  const auth = await authorizeApplePass(request, passTypeId, serial);
  if ("response" in auth) return auth.response;

  const { data } = auth;
  if (isNotModified(data.updatedAt, request.headers.get("if-modified-since"))) {
    return new Response(null, { status: 304 });
  }

  try {
    return new Response(new Uint8Array(await renderApplePass(data)), {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Last-Modified": data.updatedAt.toUTCString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[apple-wallet] no se pudo regenerar el pass:", error);
    return new Response(null, { status: 500 });
  }
}
