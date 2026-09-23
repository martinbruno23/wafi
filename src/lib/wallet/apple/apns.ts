import "server-only";
import http2 from "node:http2";
import { env } from "@/lib/env";

/**
 * Push a Apple (APNs) para avisarle al iPhone que un pass cambió — SPEC §8.2.
 *
 * El push de Wallet no lleva contenido: payload `{}` y topic = Pass Type ID.
 * Al recibirlo, iOS llama a nuestro web service (`/v1/devices/...`) y baja el
 * pass nuevo. Se autentica con mTLS usando el MISMO certificado del Pass Type ID.
 */

const APNS_HOST = "https://api.push.apple.com";
const REQUEST_TIMEOUT_MS = 10_000;

export type ApnsOutcome = "ok" | "gone" | "error";

/**
 * Interpreta la respuesta de APNs.
 * `gone`: el token ya no sirve (pass borrado, app reinstalada…), hay que dejar
 * de usarlo. Referencia: https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns
 */
export function classifyApnsResponse(status: number, reason?: string): ApnsOutcome {
  if (status === 200) return "ok";
  if (status === 410) return "gone";
  if (status === 400 && (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic")) {
    return "gone";
  }
  return "error";
}

export type PushResult = { ok: string[]; gone: string[]; failed: string[] };

/** Pushea a varios dispositivos por una sola conexión HTTP/2. Nunca lanza. */
export async function pushPassUpdates(pushTokens: string[]): Promise<PushResult> {
  const result: PushResult = { ok: [], gone: [], failed: [] };
  if (pushTokens.length === 0) return result;

  let session: http2.ClientHttp2Session;
  try {
    session = http2.connect(APNS_HOST, {
      cert: env.applePassCertPem,
      key: env.applePassKeyPem,
      passphrase: env.applePassKeyPassphrase,
    });
  } catch (error) {
    console.error("[apns] no se pudo conectar:", error);
    return { ...result, failed: [...pushTokens] };
  }
  session.on("error", (error) => console.error("[apns] error de sesión:", error));

  await Promise.all(
    pushTokens.map(async (token) => {
      try {
        const { status, reason } = await sendOne(session, token);
        const outcome = classifyApnsResponse(status, reason);
        if (outcome === "ok") result.ok.push(token);
        else if (outcome === "gone") result.gone.push(token);
        else {
          result.failed.push(token);
          console.error(`[apns] ${status} ${reason ?? ""} para ${token.slice(0, 8)}…`);
        }
      } catch (error) {
        result.failed.push(token);
        console.error(`[apns] falló el envío a ${token.slice(0, 8)}…:`, error);
      }
    }),
  );

  session.close();
  return result;
}

function sendOne(
  session: http2.ClientHttp2Session,
  token: string,
): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve, reject) => {
    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      "apns-topic": env.applePassTypeId,
      "content-type": "application/json",
    });

    let status = 0;
    let body = "";
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.close();
      reject(new Error("timeout"));
    });
    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let reason: string | undefined;
      try {
        reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined;
      } catch {
        reason = undefined;
      }
      resolve({ status, reason });
    });
    req.on("error", reject);

    req.end("{}");
  });
}
