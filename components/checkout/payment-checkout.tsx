"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Clock3, MapPin, Smartphone } from "lucide-react";
import { useCart } from "@/components/providers";
import { Wordmark } from "@/components/ui/wordmark";
import { CitySelect } from "@/components/ui/city-select";
import { CartContents } from "@/components/cart/cart";
import { readLocal, writeLocal } from "@/lib/analytics";
import { readJourney, writeJourney } from "@/lib/journey";
import { postJson } from "@/lib/client-request";
import { money, priceBasket } from "@/lib/pricing";
import {
  mbwaySchema,
  paymentInProgress,
  type PaymentOrderView,
} from "@/lib/payments";
import { locationSchema } from "@/lib/validation";

const orderKey = "jola_sandbox_payment_order";
const extraNames: Record<string, string> = {
  ice: "gelo",
  water: "água",
  cups: "copos",
  limes: "limas",
  peanuts: "amendoins",
  snack: "snack 1",
  snack2: "snack 2",
  mixer: "refrigerante 1",
  mixer2: "refrigerante 2",
};
type Draft = { phone: string; email: string; city: string };

async function getOrder(id: string): Promise<PaymentOrderView> {
  const response = await fetch(`/api/payment-orders/${id}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw new Error(
      "A confirmar pagamento. Não inicies outra tentativa ainda.",
    );
  return response.json();
}

export function PaymentCheckout() {
  const { items, ready, ageConfirmed, location, setLocation, clearPaidOrder } =
    useCart();
  const [draft, setDraft] = useState<Draft>({ phone: "", email: "", city: "" });
  const [order, setOrder] = useState<PaymentOrderView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const orderId = useRef<string | null>(null);
  const quoteKey = useRef<string | null>(null);
  const mounted = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const priced = priceBasket(items);

  const acceptOrder = useCallback(
    (next: PaymentOrderView) => {
      setOrder((previous) =>
        previous?.id === next.id && previous.state === "paid" ? previous : next,
      );
      setUncertain(false);
      setError("");
      if (next.state === "paid") clearPaidOrder(next.id, next.items);
    },
    [clearPaidOrder],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const saved = readJourney<Partial<Draft>>("jola_mbway_draft", {});
    /* eslint-disable react-hooks/set-state-in-effect */
    setDraft({
      city:
        typeof saved.city === "string" ? saved.city : (location?.city ?? ""),
      phone: typeof saved.phone === "string" ? saved.phone : "",
      email: typeof saved.email === "string" ? saved.email : "",
    });
    const id = readLocal<string | null>(orderKey, null);
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      orderId.current = id;
      getOrder(id)
        .then((next) => {
          if (mounted.current) acceptOrder(next);
        })
        .catch(() => {
          if (mounted.current) {
            setUncertain(true);
            setError(
              "A confirmar pagamento. Não inicies outra tentativa ainda.",
            );
          }
        })
        .finally(() => {
          if (mounted.current) setLoaded(true);
        });
    } else setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Hydrate once; a location change must not reset an in-flight payment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, acceptOrder]);

  useEffect(() => {
    const id = orderId.current;
    if (
      !id ||
      !loaded ||
      (!uncertain && (!order || !paymentInProgress(order.state)))
    )
      return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!document.hidden && !inFlight.current) {
        try {
          const next = await getOrder(id);
          if (!cancelled) acceptOrder(next);
        } catch {
          if (!cancelled) {
            setUncertain(true);
            setError("A confirmar pagamento. O pedido continua guardado.");
          }
        }
      }
      if (!cancelled) timeout = setTimeout(poll, 4000);
    };
    timeout = setTimeout(poll, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [order, uncertain, loaded, acceptOrder]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (order && ageConfirmed) headingRef.current?.focus();
  }, [order?.state, ageConfirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  function edit(field: keyof Draft, value: string) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    writeJourney("jola_mbway_draft", next);
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      inFlight.current ||
      !ageConfirmed ||
      uncertain ||
      (order && paymentInProgress(order.state))
    )
      return;
    const contact = mbwaySchema.safeParse({
      phone: draft.phone,
      email: draft.email.trim(),
      retry: !!order && ["failed", "expired"].includes(order.state),
    });
    const city = locationSchema.safeParse({ city: draft.city });
    if (!contact.success || (!order && !city.success)) {
      setError(
        !contact.success
          ? contact.error.issues[0].message
          : "Seleciona a tua cidade.",
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (!order) {
        if (!quoteKey.current) quoteKey.current = crypto.randomUUID();
        const next = await postJson<PaymentOrderView>("/api/payment-orders", {
          checkout_key: quoteKey.current,
          items,
          location: city.data,
          age_confirmed: true,
        });
        // The cookie is established by this non-charging request before MB WAY.
        orderId.current = next.id;
        writeLocal(orderKey, next.id);
        setLocation({ city: next.city });
        if (mounted.current) acceptOrder(next);
      } else {
        // Persist the order id before charging. A lost response resumes via GET.
        const next = await postJson<PaymentOrderView>(
          `/api/payment-orders/${order.id}/mbway`,
          contact.data,
        );
        if (mounted.current) acceptOrder(next);
      }
    } catch (error) {
      if (!mounted.current) return;
      if (orderId.current) setUncertain(true);
      else quoteKey.current = null; // No money can move before a quote has returned.
      setError(
        orderId.current
          ? "A confirmar pagamento. Não inicies outra tentativa ainda."
          : error instanceof Error
            ? error.message
            : "Não conseguimos preparar o pagamento.",
      );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function checkAgain() {
    if (!orderId.current || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      acceptOrder(await getOrder(orderId.current));
    } catch {
      setError("A confirmar pagamento. Volta a tentar a verificação.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function newOrder() {
    writeLocal(orderKey, null);
    writeJourney("jola_mbway_draft", { ...draft, phone: "", email: "" });
  }

  const pending = !!order && paymentInProgress(order.state);
  const completed = order?.state === "paid";
  const failed = order?.state === "failed" || order?.state === "expired";
  const locked = busy || pending || uncertain || completed;
  const total = order?.total ?? priced.total;
  return (
    <>
      <header className="checkout-header container">
        <Wordmark />
        <span>MB WAY · Teste</span>
      </header>
      <main id="main" className="container checkout-layout payment-checkout">
        <div className="checkout-main">
          <Link className="back-link" href="/pedir">
            <ArrowLeft size={16} />
            Voltar à noite
          </Link>
          <p className="payment-test-badge">Modo de teste — sem cobrança</p>
          {!ready || !loaded ? (
            <p role="status" className="checkout-loading">
              A recuperar o teu pedido…
            </p>
          ) : !items.length && !order && !uncertain ? (
            <CartContents />
          ) : (
            <>
              <div className="checkout-icon">
                {completed ? (
                  <Check size={26} />
                ) : pending || uncertain ? (
                  <Clock3 size={26} />
                ) : (
                  <Smartphone size={26} />
                )}
              </div>
              <h1 ref={headingRef} tabIndex={-1}>
                {completed
                  ? "Pagamento confirmado."
                  : uncertain || order?.state === "reconciling"
                    ? "A confirmar pagamento."
                    : pending
                      ? "A aguardar confirmação."
                      : order?.state === "expired"
                        ? "O pedido expirou."
                        : failed
                          ? "Pagamento não concluído."
                          : order
                            ? "Tudo pronto?"
                            : "A tua Jola, com MB WAY."}
              </h1>
              <p className="checkout-description">
                {completed
                  ? "O pagamento de teste ficou guardado. Não foi cobrado dinheiro e não será feita uma entrega."
                  : pending || uncertain
                    ? "Estamos a verificar o estado do pedido. Podes voltar a esta página; evita iniciar outro pagamento."
                    : failed
                      ? "Não foi confirmado um pagamento. Podes tentar novamente com o mesmo carrinho."
                      : "Revê a tua noite e confirma o número associado ao MB WAY."}
              </p>
              {order && (
                <p className="selected-location">
                  <MapPin size={16} />
                  {order.city}
                </p>
              )}
              {!completed && !pending && !uncertain && (
                <form
                  className="form-stack checkout-form"
                  onSubmit={submit}
                  aria-busy={busy}
                >
                  {!order && (
                    <label>
                      A tua cidade
                      <CitySelect
                        value={draft.city}
                        disabled={locked}
                        onChange={(event) => edit("city", event.target.value)}
                      />
                    </label>
                  )}
                  <label>
                    Número MB WAY
                    <input
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      required
                      maxLength={30}
                      placeholder="912 345 678"
                      value={draft.phone}
                      disabled={locked}
                      onChange={(event) => edit("phone", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>
                      Email <span className="form-footnote">(opcional)</span>
                    </span>
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      maxLength={180}
                      value={draft.email}
                      disabled={locked}
                      onChange={(event) => edit("email", event.target.value)}
                    />
                  </label>
                  <p className="form-footnote">
                    Estes dados pertencem ao pedido de teste. Não te inscrevemos
                    na lista de espera.
                  </p>
                  <button
                    className="button button-primary"
                    disabled={locked || !ageConfirmed}
                    aria-busy={busy}
                  >
                    {busy
                      ? "A preparar…"
                      : order
                        ? `${failed ? "Tentar pagar" : "Pagar"} ${money(total)} com MB WAY`
                        : "Rever pagamento"}
                  </button>
                </form>
              )}
              {(pending || uncertain) && (
                <button
                  className="button button-secondary payment-check-button"
                  disabled={busy || !ageConfirmed}
                  onClick={checkAgain}
                >
                  {busy ? "A verificar…" : "Verificar pagamento"}
                </button>
              )}
              {completed && (
                <Link
                  className="button button-primary payment-check-button"
                  href="/pedir"
                  onClick={newOrder}
                >
                  Preparar outro pedido de teste
                </Link>
              )}
              {error && (
                <p
                  ref={errorRef}
                  tabIndex={-1}
                  role="alert"
                  className="form-error"
                >
                  {error}
                </p>
              )}
            </>
          )}
        </div>
        {ready && loaded && (order || items.length > 0) && (
          <aside
            className="checkout-summary payment-summary"
            aria-label="Resumo do pagamento"
          >
            <div className="cart-heading">
              <h2>A tua noite</h2>
            </div>
            <div className="payment-lines">
              {(order?.items ?? priced.items).map((line) => (
                <div key={line.id} className="payment-line">
                  <div>
                    <strong>
                      {line.quantity} × {line.name}
                    </strong>
                    {line.contents && <p>{line.contents.join(" · ")}</p>}
                    {!!line.removed_extras?.length && (
                      <p>
                        Retirado:{" "}
                        {line.removed_extras
                          .map((key) => extraNames[key] ?? key)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <strong>{money(line.quantity * line.price)}</strong>
                </div>
              ))}
            </div>
            <div className="cart-totals">
              <div>
                <span>Subtotal</span>
                <span>{money(order?.subtotal ?? priced.subtotal)}</span>
              </div>
              <div>
                <span>Entrega</span>
                <span>{money(order?.delivery_fee ?? priced.delivery_fee)}</span>
              </div>
              <div>
                <span>Taxa Jola</span>
                <span>{money(order?.service_fee ?? priced.service_fee)}</span>
              </div>
              <div className="cart-total">
                <strong>Total</strong>
                <strong>{money(total)}</strong>
              </div>
            </div>
            <p className="checkout-summary-note">
              {order
                ? "Este é o carrinho guardado para este pagamento."
                : "O total será confirmado no servidor antes do pagamento."}{" "}
              Teste sem cobrança ou entrega.
            </p>
          </aside>
        )}
      </main>
      <footer className="checkout-footer">
        <Link href="/privacidade">Privacidade</Link> · Pagamentos em ambiente de
        testes
      </footer>
    </>
  );
}
