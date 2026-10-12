import "server-only";
import { RequestError } from "../http";
import { staffSession } from "./auth";
export async function merchantRpc(
  name: string,
  args: Record<string, unknown> = {},
) {
  const { client } = await staffSession();
  const { data, error } = await client.rpc(name, args);
  if (error?.code === "42501")
    throw new RequestError("Acesso não autorizado.", 403);
  if (error?.code === "40001" || error?.code === "23505")
    throw new RequestError("O pedido mudou. Atualiza antes de continuar.", 409);
  if (error) throw error;
  return data;
}
