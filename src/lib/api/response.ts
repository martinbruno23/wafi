import { NextResponse } from "next/server";

/** Formato de error uniforme de la API — SPEC §7. */
export type ApiError = { error: { code: string; message: string } };

export function apiError(code: string, message: string, status: number) {
  return NextResponse.json<ApiError>({ error: { code, message } }, { status });
}

/** Error de negocio con un status HTTP asociado; lo mapea `handleRoute`. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Envuelve un route handler: convierte HttpError en la respuesta correcta y
 * cualquier otra excepción en un 500 sin filtrar detalles internos.
 */
export async function handleRoute<T>(
  fn: () => Promise<NextResponse<T>>,
): Promise<NextResponse<T | ApiError>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error("[api] error inesperado:", error);
    return apiError(
      "INTERNAL_ERROR",
      "Algo salió mal. Probá de nuevo en un momento.",
      500,
    );
  }
}
