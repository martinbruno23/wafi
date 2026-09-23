import { z } from "zod";
import {
  authorizeApplePass,
  registerDevice,
  unregisterDevice,
} from "@/lib/services/apple-registrations";

type Params = {
  params: Promise<{ deviceId: string; passTypeId: string; serial: string }>;
};

const registrationSchema = z.object({ pushToken: z.string().min(1) });

/**
 * POST — el iPhone agregó el pass y se registra para recibir actualizaciones.
 * 201 registración nueva · 200 ya existía · 401 no autorizado.
 */
export async function POST(request: Request, { params }: Params) {
  const { deviceId, passTypeId, serial } = await params;

  const auth = await authorizeApplePass(request, passTypeId, serial);
  if ("response" in auth) return auth.response;

  const body = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return new Response(null, { status: 400 });

  try {
    const result = await registerDevice(deviceId, serial, body.data.pushToken);
    return new Response(null, { status: result === "created" ? 201 : 200 });
  } catch (error) {
    console.error("[apple-wallet] registración falló:", error);
    return new Response(null, { status: 500 });
  }
}

/** DELETE — el usuario borró el pass del iPhone. */
export async function DELETE(request: Request, { params }: Params) {
  const { deviceId, passTypeId, serial } = await params;

  const auth = await authorizeApplePass(request, passTypeId, serial);
  if ("response" in auth) return auth.response;

  await unregisterDevice(deviceId, serial);
  return new Response(null, { status: 200 });
}
