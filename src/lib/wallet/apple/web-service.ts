/**
 * Piezas puras del PassKit Web Service — SPEC §7.
 * Contrato fijado por Apple:
 * https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El serialNumber de nuestros passes es el `cards.id` (un UUID). */
export function isValidSerial(serial: string): boolean {
  return UUID_RE.test(serial);
}

/** Extrae el token de `Authorization: ApplePass <token>`. */
export function parseApplePassAuth(header: string | null): string | null {
  if (!header) return null;
  const match = /^ApplePass\s+(\S+)$/.exec(header.trim());
  return match ? match[1] : null;
}

export type RegisteredPass = { serial: string; updatedAt: Date };

/**
 * Qué passes de un dispositivo cambiaron desde `since`.
 *
 * `since` es el `lastUpdated` que devolvimos la vez anterior (Apple lo guarda y
 * nos lo reenvía tal cual); usamos milisegundos epoch como texto. Sin `since`
 * (primera consulta) van todos. Devuelve null si no hay cambios (→ HTTP 204).
 */
export function updatedSerials(
  passes: RegisteredPass[],
  since: string | null,
): { serialNumbers: string[]; lastUpdated: string } | null {
  const sinceMs = since && /^\d+$/.test(since) ? Number(since) : null;

  const changed = passes.filter(
    (p) => sinceMs === null || p.updatedAt.getTime() > sinceMs,
  );
  if (changed.length === 0) return null;

  const latest = Math.max(...changed.map((p) => p.updatedAt.getTime()));
  return {
    serialNumbers: changed.map((p) => p.serial),
    lastUpdated: String(latest),
  };
}

/**
 * true si el iPhone ya tiene la última versión (→ HTTP 304).
 * Los headers HTTP tienen precisión de segundos: comparamos en segundos.
 */
export function isNotModified(updatedAt: Date, ifModifiedSince: string | null): boolean {
  if (!ifModifiedSince) return false;
  const since = Date.parse(ifModifiedSince);
  if (Number.isNaN(since)) return false;
  return Math.floor(updatedAt.getTime() / 1000) <= Math.floor(since / 1000);
}
