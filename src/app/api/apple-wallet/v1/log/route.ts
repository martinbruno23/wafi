/**
 * POST — iOS reporta acá los errores que encuentra con nuestros passes
 * (firma inválida, web service caído, etc.). Es la única forma de enterarse de
 * problemas que pasan dentro del iPhone: quedan en los logs de Vercel.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { logs?: unknown } | null;
  const logs = Array.isArray(body?.logs) ? body.logs : [];
  for (const line of logs.slice(0, 50)) {
    console.error("[apple-wallet][device]", String(line).slice(0, 500));
  }
  return new Response(null, { status: 200 });
}
