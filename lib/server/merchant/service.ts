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
  if (
    error?.code === "P0001" ||
    error?.code === "22023" ||
    error?.code === "22P02"
  )
    throw new RequestError(
      "A ação foi recusada. Confirma os dados e atualiza o pedido.",
      400,
    );
  if (error?.code === "P0002")
    throw new RequestError("Pedido indisponível.", 404);
  if (error) throw error;
  return data;
}
