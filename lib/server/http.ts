import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
const globalLimits = globalThis as typeof globalThis & {
  jolaLimits?: Map<string, { count: number; until: number }>;
};
const limits = (globalLimits.jolaLimits ??= new Map());
export class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function parseRequest<T>(
  request: Request,
  schema: z.ZodType<T>,
  limit = 60,
): Promise<T> {
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(request.url);
  expectedOrigin.host = request.headers.get("host") || expectedOrigin.host;
  if (origin && origin !== expectedOrigin.origin)
    throw new RequestError("Origem inválida.", 403);
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${new URL(request.url).pathname}:${ip}`;
  const now = Date.now();
  if (limits.size > 10000)
    for (const [k, v] of limits) if (v.until < now) limits.delete(k);
  const entry = limits.get(key);
  if (entry && entry.until > now) {
    if (entry.count >= limit)
      throw new RequestError(
        "Demasiadas tentativas. Espera um minuto e volta a tentar.",
        429,
      );
    entry.count++;
  } else limits.set(key, { count: 1, until: now + 60000 });
  if (Number(request.headers.get("content-length") || 0) > 16000)
    throw new RequestError("Pedido demasiado grande.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Pedido inválido.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16000) {
      await reader.cancel();
      throw new RequestError("Pedido demasiado grande.", 413);
    }
    chunks.push(value);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError("Pedido inválido.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new RequestError(
      parsed.error.issues[0]?.message || "Confere os campos e tenta outra vez.",
    );
  return parsed.data;
}
export function apiError(
  error: unknown,
  message = "Não conseguimos guardar agora. Os teus dados continuam no formulário. Tenta novamente.",
) {
  if (error instanceof RequestError)
    return NextResponse.json(
      { error: error.message },
      {
        status: error.status,
        ...(error.status === 429 ? { headers: { "Retry-After": "60" } } : {}),
      },
    );
  console.error(
    "[Jola] Request failed:",
    error instanceof Error ? error.name : "StorageError",
    typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string" &&
      /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error.code)
      ? `code=${error.code}`
      : "code=unknown",
  );
  return NextResponse.json(
    {
      error: message,
    },
    { status: 503 },
  );
}
