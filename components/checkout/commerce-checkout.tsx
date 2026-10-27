"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CartItem, PackOptions } from "@/types";
import type { CommerceCatalogItem, OrderView } from "@/lib/commerce";
import { packById } from "@/lib/products";
import { componentChoices, packOptions } from "@/lib/packs";
import { parseCommerceCart } from "@/lib/commerce-cart";
import { readLocal, writeLocal } from "@/lib/analytics";
import { postJson } from "@/lib/client-request";
import { money } from "@/lib/pricing";
import { Wordmark } from "@/components/ui/wordmark";
import { useCart } from "@/components/providers";
type Quote = OrderView & { quote_expires_at: string; eta: string };
export function CommerceCheckout({
  environment,
}: {
  environment: "sandbox" | "live";
}) {
  const { ageConfirmed } = useCart();
  const [catalog, setCatalog] = useState<CommerceCatalogItem[]>([]),
    [items, setItems] = useState<CartItem[]>([]),
    [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [quoteKey, setQuoteKey] = useState<string | null>(null);
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const router = useRouter();
  const command = useRef<string | null>(null),
    inFlight = useRef(false);
  const storageKey = `ruvon_${environment}_commerce_cart`,
    orderKey = `ruvon_${environment}_commerce_order`;
  useEffect(() => {
    let active = true;
    async function recover() {
      const saved = parseCommerceCart(readLocal(storageKey, null));
      const previous = readLocal<string | null>(orderKey, null);
      if (active) setItems(saved.items);
      if (previous) {
        try {
          const response = await fetch(`/api/commerce/orders/${previous}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok)
            throw new Error(
              "Não conseguimos recuperar o pedido guardado. Consulta o estado antes de iniciar outro.",
            );
          const order: OrderView = await response.json();
          if (["cancelled", "completed"].includes(order.operational_status)) {
            writeLocal(orderKey, null);
          } else if (
            order.operational_status === "awaiting_payment" &&
            order.payment_status === "not_started"
          ) {
            if (active) setQuote(order);
          } else {
            router.replace(`/pedido/${order.id}`);
            return;
          }
        } catch (e) {
          if (active) {
            setRecoveryId(previous);
            setError(
              e instanceof Error ? e.message : "A recuperar o pedido guardado.",
            );
          }
          return;
        }
      }
      if (active) setLoaded(true);
    }
    void recover();
    fetch("/api/commerce/catalog", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            "Os pedidos estão temporariamente indisponíveis. Podes registar interesse na tua zona.",
          );
        const stores = await r.json();
        if (active) setCatalog(stores[0]?.catalog ?? []);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [storageKey, orderKey, router]);
  function update(next: CartItem[]) {
    if (quote) return;
    setItems(next);
    const saved = parseCommerceCart(readLocal(storageKey, null));
    writeLocal(storageKey, { ...saved, items: next });
    setQuoteKey(null);
  }
  async function review(form: HTMLFormElement) {
    const data = new FormData(form);
    const key = quoteKey ?? crypto.randomUUID();
    setQuoteKey(key);
    const q = await postJson<Quote>("/api/commerce/quotes", {
      checkout_key: key,
      items,
      address: {
        street_address: [
          String(data.get("street")),
          ...(data.get("floor") ? [String(data.get("floor"))] : []),
        ],
        city: String(data.get("city")),
        zip_code: String(data.get("postcode")),
        country: "PT",
      },
    });
    setQuote(q);
    writeLocal(orderKey, q.id);
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current || !ageConfirmed || !loaded || recoveryId) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (!quote) {
        await review(e.currentTarget);
      } else {
        const data = new FormData(e.currentTarget);
        command.current ??= crypto.randomUUID();
        await postJson("/api/commerce/orders", {
          quote_id: quote.id,
          command_id: command.current,
          contact: {
            name: String(data.get("name")),
            phone: String(data.get("phone")),
            email: String(data.get("email") ?? ""),
          },
          method: String(data.get("method") ?? "MBW"),
          age_confirmed: true,
          terms_confirmed: data.get("terms") === "on",
          retry: false,
        });
        router.push(`/pedido/${quote.id}`);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível confirmar. O pedido continua guardado.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <main id="main" className="container commerce-page">
      <Wordmark />
      <h1>A tua noite, à porta.</h1>
      {environment === "sandbox" && (
        <p className="payment-test-badge">Ambiente de testes</p>
      )}
      <p>
        Uma loja prepara o pedido completo. Os preços e a entrega ficam
        confirmados antes de autorizares o pagamento.
      </p>
      <p role="alert">{error}</p>
      {recoveryId && (
        <Link
          className="button button-secondary"
          href={`/pedido/${recoveryId}`}
        >
          Consultar pedido guardado
        </Link>
      )}
      {!quote && (
        <div className="commerce-grid">
          {catalog.map((p) => {
            const item = items.find((i) => i.id === p.id),
              pack = packById.get(p.id);
            return (
              <article className="commerce-card" key={p.id}>
                <h2>{p.name}</h2>
                <p>
                  {money(p.unit_price)}
                  {p.unit ? ` · ${p.unit}` : ""}
                  {pack ? " · configuração base" : ""}
                </p>
                <div className="commerce-actions">
                  <button
                    className="button button-secondary"
                    disabled={!loaded || busy || (item?.quantity ?? 0) >= 30}
                    onClick={() =>
                      update(
                        item
                          ? items.map((i) =>
                              i.id === p.id
                                ? { ...i, quantity: i.quantity + 1 }
                                : i,
                            )
                          : [
                              ...items,
                              {
                                id: p.id,
                                quantity: 1,
                                ...(pack ? { options: packOptions(pack) } : {}),
                              },
                            ],
                      )
                    }
                  >
                    Adicionar
                  </button>
                  {item && (
                    <button
                      className="button button-quiet"
                      disabled={!loaded || busy}
                      onClick={() =>
                        update(
                          items.flatMap((i) =>
                            i.id !== p.id
                              ? [i]
                              : i.quantity > 1
                                ? [{ ...i, quantity: i.quantity - 1 }]
                                : [],
                          ),
                        )
                      }
                    >
                      Retirar · {item.quantity}
                    </button>
                  )}
                </div>
                {item &&
                  pack &&
                  [...pack.core, ...pack.extras]
                    .filter((c) => c.key)
                    .map((part) => (
                      <label key={part.key}>
                        {part.label}
                        <select
                          disabled={!loaded || busy}
                          value={item.options?.[part.key!]}
                          onChange={(e) =>
                            update(
                              items.map((i) =>
                                i.id === item.id
                                  ? {
                                      ...i,
                                      options: {
                                        ...i.options,
                                        [part.key!]: e.target.value,
                                      } as PackOptions,
                                    }
                                  : i,
                              ),
                            )
                          }
                        >
                          {componentChoices(
                            part,
                            pack.extras.some((e) => e.key === part.key),
                          ).map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
              </article>
            );
          })}
        </div>
      )}
      <form onSubmit={submit} aria-busy={busy}>
        {!quote ? (
          <>
            <h2>Onde entregamos?</h2>
            <label>
              Morada
              <input
                name="street"
                autoComplete="street-address"
                required
                minLength={3}
                maxLength={160}
                disabled={busy}
              />
            </label>
            <label>
              Andar / porta (opcional)
              <input name="floor" maxLength={160} disabled={busy} />
            </label>
            <label>
              Código postal
              <input
                name="postcode"
                autoComplete="postal-code"
                pattern="[0-9]{4}-[0-9]{3}"
                placeholder="1000-001"
                required
                disabled={busy}
              />
            </label>
            <label>
              Cidade
              <input
                name="city"
                autoComplete="address-level2"
                required
                disabled={busy}
              />
            </label>
            <p>
              {items.reduce((s, i) => s + i.quantity, 0)} artigos no carrinho.
              As opções escolhidas serão incluídas no preço confirmado.
            </p>
          </>
        ) : (
          <>
            <h2>Revê o teu pedido</h2>
            <ul>
              {quote.items.map((i) => (
                <li key={i.id}>
                  {i.quantity} × {i.name} · {money(i.line_price)}
                  <ul>
                    {i.recipe.map((p) => (
                      <li key={p.sku}>
                        {p.quantity * i.quantity} × {p.sku}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <dl className="commerce-receipt">
              <div>
                <dt>Produtos</dt>
                <dd>{money(quote.subtotal)}</dd>
              </div>
              <div>
                <dt>Entrega</dt>
                <dd>{money(quote.delivery_fee)}</dd>
              </div>
              <div>
                <dt>Taxa Ruvon</dt>
                <dd>{money(quote.service_fee)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{money(quote.total)}</dd>
              </div>
            </dl>
            <p>
              Estimativa de entrega:{" "}
              {new Date(quote.eta).toLocaleTimeString("pt-PT", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              . Cotação válida até{" "}
              {new Date(quote.quote_expires_at).toLocaleTimeString("pt-PT", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </p>
            <label>
              Nome de quem recebe
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={120}
              />
            </label>
            <label>
              Número MB WAY e contacto para entrega
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                maxLength={30}
              />
            </label>
            <label>
              Email (opcional)
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={180}
              />
            </label>
            <label>
              Método de autorização
              <select name="method">
                <option value="MBW">MB WAY</option>
                <option value="CC">Cartão · Formulário seguro Easypay</option>
              </select>
            </label>
            <p>
              O pagamento autoriza o valor. Só confirmamos a compra depois de a
              loja aceitar e a entrega ser criada. Se não for possível,
              cancelamos e libertamos ou devolvemos o valor.
            </p>
            <p>
              Entrega em mão a uma pessoa com 18 anos ou mais. Apresenta
              identificação quando pedida. Uma recusa de entrega implica
              regresso à loja e análise da resolução.
            </p>
            <label>
              <input name="terms" type="checkbox" required /> Tenho 18 anos ou
              mais e aceito os <Link href="/termos">termos</Link> e a{" "}
              <Link href="/privacidade">privacidade</Link>.
            </label>
            <Link href={`/pedido/${quote.id}`}>
              Consultar este pedido guardado
            </Link>
          </>
        )}
        <button
          className="button button-primary"
          disabled={!loaded || busy || !items.length || !ageConfirmed}
        >
          {busy
            ? "A confirmar…"
            : quote
              ? `Autorizar ${money(quote.total)}`
              : "Confirmar preços e entrega"}
        </button>
      </form>
      <p>
        <Link href="/checkout?interesse=1">
          A minha zona ainda não está coberta · Entrar na lista
        </Link>
      </p>
    </main>
  );
}
