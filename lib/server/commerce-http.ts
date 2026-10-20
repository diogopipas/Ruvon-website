import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { RequestError } from "./http";
import { commerceEnvironment, requireSecret } from "./commerce-config";
import { orderRepository } from "./orders/repository";
export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export async function commerceOwner(create = false) {
  const jar = await cookies();
  const name = `ruvon_${commerceEnvironment()}_order_owner`;
  const current = jar.get(name)?.value;
  if (current && /^[a-f0-9]{64}$/.test(current)) return hash(current);
  if (!create)
    throw new RequestError("Pedido indisponível neste dispositivo.", 404);
  const token = randomBytes(32).toString("hex");
  jar.set(name, token, {
    httpOnly: true,
    secure: !!process.env.VERCEL || process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400,
  });
  return hash(token);
}
export function secureEqual(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function workerAuth(request: Request) {
  if (
    !secureEqual(
      request.headers.get("authorization") ?? "",
      `Bearer ${requireSecret("RUVON_WORKER_SECRET", 32)}`,
    )
  )
    throw new RequestError("Não autorizado.", 401);
}
export async function rawBody(
  request: Request,
  maximum = 16000,
  contentType = "application/json",
) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    contentType
  )
    throw new RequestError("Formato inválido.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Pedido inválido.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maximum) {
      await reader.cancel();
      throw new RequestError("Pedido demasiado grande.", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function commerceInput<T>(
  request: Request,
  schema: z.ZodType<T>,
  owner: string,
) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new RequestError("Origem inválida.", 403);
  const minute = Math.floor(Date.now() / 60000);
  const network =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  const salt = requireSecret("RUVON_RATE_LIMIT_SECRET", 32);
  const allowed = await orderRepository().rpc<boolean>("commerce_rate_limit", {
    p_keys: [
      `owner:${owner}:${minute}`,
      `network:${hash(`${salt}:${minute}:${network}`)}`,
    ],
    p_limit: 20,
  });
  if (!allowed)
    throw new RequestError("Demasiadas tentativas. Espera um minuto.", 429);
  try {
    return schema.parse(JSON.parse((await rawBody(request)).toString("utf8")));
  } catch (e) {
    if (e instanceof RequestError) throw e;
    throw new RequestError("Confere os campos e tenta novamente.");
  }
}
export const privateJson = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
