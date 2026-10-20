import "server-only";
import type { z } from "zod";
import { quoteSchema, startOrderSchema } from "@/lib/commerce";
import { privacyConfig } from "@/lib/privacy";
import {
  commerceEnvironment,
  commerceExposed,
  easypayCommerceConfig,
  uberConfig,
} from "../commerce-config";
import { hash } from "../commerce-http";
import { RequestError } from "../http";
import { UberDirectProvider } from "../delivery/uber-direct";
import { orderRepository } from "./repository";
import { eligibleStore } from "./routing";
import { buildStoreCatalog, priceStoreBasket } from "./pricing";

export async function checkoutReady(method = "MBW") {
  if (!commerceExposed())
    throw new RequestError("O piloto ainda não está disponível.", 404);
  easypayCommerceConfig();
  uberConfig();
  if (commerceEnvironment() === "live" && !privacyConfig().ready)
    throw new RequestError("Configuração do piloto incompleta.", 503);
  if (
    !(await orderRepository().rpc<boolean>("commerce_checkout_ready", {
      p_environment: commerceEnvironment(),
      p_method: method,
    }))
  )
    throw new RequestError("O piloto está temporariamente em pausa.", 503);
}
export async function commerceCatalog() {
  await checkoutReady();
  const repo = orderRepository();
  const stores = await repo.stores();
  return Promise.all(
    stores.map(async (store) => {
      const stock = await repo.products(store.id);
      const catalog = buildStoreCatalog(stock, store.commission_bps);
      return {
        id: store.id,
        name: store.name,
        catalog,
        postcodes: store.delivery_postcodes,
      };
    }),
  );
}
export async function createQuote(
  input: z.infer<typeof quoteSchema>,
  owner: string,
) {
  await checkoutReady();
  const repo = orderRepository();
  const basketHash = hash(
    JSON.stringify({ items: input.items, address: input.address }),
  );
  const existing = await repo.existing(owner, input.checkout_key);
  if (existing) {
    if (
      (
        existing.quote_snapshot as typeof existing.quote_snapshot & {
          basket_hash: string;
        }
      ).basket_hash !== basketHash
    )
      throw new RequestError("O carrinho mudou. Pede uma nova cotação.", 409);
    return existing;
  }
  const store = (await repo.stores()).find((s) =>
    eligibleStore(s, input.address),
  );
  if (!store)
    throw new RequestError(
      "Ainda não entregamos nesta morada. Podes entrar na lista de interesse.",
      422,
    );
  const stock = await repo.products(store.id);
  priceStoreBasket(
    input.items,
    stock,
    0,
    store.service_fee,
    store.commission_bps,
  );
  const quote = await new UberDirectProvider().quote(
    store.pickup_address,
    input.address,
  );
  const priced = priceStoreBasket(
    input.items,
    stock,
    quote.fee,
    store.service_fee,
    store.commission_bps,
  );
  if (priced.allocation.merchant < 50 || priced.allocation.ruvon < 50)
    throw new RequestError("O valor não permite a divisão do pagamento.");
  const snapshot = {
    ...priced,
    store_id: store.id,
    delivery_address: input.address,
    quote_snapshot: { ...quote, basket_hash: basketHash },
    quote_expires_at: quote.expires_at,
    environment: commerceEnvironment(),
  };
  return repo.rpc<import("@/lib/commerce").CommerceOrder>(
    "commerce_create_quote",
    {
      p_data: {
        ...snapshot,
        owner_hash: owner,
        checkout_key: input.checkout_key,
        snapshot_hash: hash(JSON.stringify(snapshot)),
      },
    },
  );
}
export async function startOrder(
  input: z.infer<typeof startOrderSchema>,
  owner: string,
) {
  await checkoutReady(input.method);
  const repo = orderRepository();
  await repo.order(input.quote_id, owner);
  return repo.rpc("commerce_start_order", {
    p_order: input.quote_id,
    p_owner: owner,
    p_command: input.command_id,
    p_contact: input.contact,
    p_method: input.method,
    p_account: easypayCommerceConfig().account,
    p_retry: input.retry,
  });
}
