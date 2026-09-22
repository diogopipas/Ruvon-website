"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Mail,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useCart } from "@/components/providers";
import { Wordmark } from "@/components/ui/wordmark";
import { CartContents } from "@/components/cart/cart";
import { attribution, getSession, track, trackOnce } from "@/lib/analytics";
import { postJson } from "@/lib/client-request";
import {
  checkoutKey,
  formatPostcode,
  locationKey,
  readJourney,
  writeJourney,
} from "@/lib/journey";
import { money, priceBasket } from "@/lib/pricing";
import { contactSchema, locationSchema } from "@/lib/validation";
type Step = "location" | "contact" | "success";
type Draft = { email: string; phone: string; consent: boolean };
const emptyDraft: Draft = { email: "", phone: "", consent: false };
export function CheckoutFlow() {
  const params = useSearchParams();
  const interest = params.get("interesse") === "1";
  const chosenCity = params.get("cidade") || "";
  const {
    items,
    ready,
    ageConfirmed,
    location,
    setLocation,
    syncOrder,
    notify,
  } = useCart();
  const [step, setStep] = useState<Step>("location");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const inFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const previousStep = useRef<Step>("location");
  const scope = checkoutKey(items, interest, chosenCity);
  const zone = locationKey(location);
  const currentJourney = useRef<{ scope: string; zone: string } | null>(null);
  useLayoutEffect(() => {
    currentJourney.current = { scope, zone };
    return () => {
      currentJourney.current = null;
    };
  }, [scope, zone]);
  const priced = priceBasket(items);
  useEffect(() => {
    if (!ready) return;
    const saved = readJourney<{ step?: Step; zone?: string } | null>(
      `jola_checkout:${getSession()}:${scope}`,
      null,
    );
    /* eslint-disable react-hooks/set-state-in-effect */
    setStep(
      saved?.zone === zone &&
        zone &&
        (saved.step === "contact" || saved.step === "success")
        ? saved.step
        : "location",
    );
    const address = readJourney<{ city?: string; postcode?: string } | null>(
      `jola_address:${scope}`,
      null,
    );
    setCity(
      typeof address?.city === "string"
        ? address.city
        : chosenCity || location?.city || "",
    );
    setPostcode(
      typeof address?.postcode === "string"
        ? address.postcode
        : location?.postcode || "",
    );
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [ready, scope, zone, chosenCity, location]);
  useEffect(() => {
    if (!ready) return;
    const saved = readJourney<Partial<Draft> | null>(
      "jola_contact_draft",
      null,
    );
    // A tab-scoped draft survives a refresh and keeps the two contact options separate.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft({
      email: typeof saved?.email === "string" ? saved.email.slice(0, 180) : "",
      phone: typeof saved?.phone === "string" ? saved.phone.slice(0, 180) : "",
      consent: saved?.consent === true,
    });
    setMode(
      readJourney<string>("jola_contact_mode", "email") === "phone"
        ? "phone"
        : "email",
    );
  }, [ready]);
  useEffect(() => {
    if (ageConfirmed && previousStep.current !== step)
      headingRef.current?.focus();
    previousStep.current = step;
  }, [step, ageConfirmed]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  function saveStep(next: Step, nextZone = zone) {
    writeJourney(`jola_checkout:${getSession()}:${scope}`, {
      step: next,
      zone: nextZone,
    });
    setStep(next);
    setError("");
  }
  function saveDraft(next: Draft) {
    setDraft(next);
    writeJourney("jola_contact_draft", next);
  }
  function chooseMode(next: "email" | "phone") {
    setMode(next);
    writeJourney("jola_contact_mode", next);
    setError("");
  }
  async function locationSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !ageConfirmed) return;
    setError("");
    const parsed = locationSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      if (!interest && items.length) await syncOrder(true, parsed.data);
      if (currentJourney.current?.scope !== scope) return;
      setLocation(parsed.data);
      track("location_entered", {
        ...parsed.data,
        basket_value: priced.subtotal / 100,
        item_count: priced.item_count,
      });
      saveStep("contact", locationKey(parsed.data));
    } catch (error) {
      if (currentJourney.current?.scope !== scope) return;
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível guardar a zona. Tenta novamente.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function contactSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !ageConfirmed) return;
    setError("");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = contactSchema.safeParse(form.contact);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (!location) {
      saveStep("location");
      return;
    }
    if (form.consent !== "on") {
      setError("Confirma que queres receber novidades sobre o lançamento.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      await postJson("/api/leads", {
        session_id: getSession(),
        items: interest ? [] : items,
        location,
        attribution: attribution(),
        contact: parsed.data,
        consent: form.consent === "on",
        website: form.website || "",
        reached_checkout: !interest,
      });
      trackOnce(
        "waitlist_submitted",
        {
          city: location.city,
          postcode: location.postcode,
          basket_value: interest ? 0 : priced.subtotal / 100,
          item_count: interest ? 0 : priced.item_count,
        },
        `waitlist_submitted:${scope}:${zone}`,
      );
      // The successful request belongs to the submitted journey. Navigation
      // or a basket change while it was pending must not complete another one.
      writeJourney(`jola_checkout:${getSession()}:${scope}`, {
        step: "success",
        zone,
      });
      if (
        currentJourney.current?.scope !== scope ||
        currentJourney.current.zone !== zone
      )
        return;
      saveDraft(emptyDraft);
      saveStep("success");
    } catch (error) {
      if (
        currentJourney.current?.scope !== scope ||
        currentJourney.current.zone !== zone
      )
        return;
      setError(
        error instanceof Error
          ? error.message
          : "Não conseguimos guardar. Tenta novamente.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function share() {
    track("share_clicked", { source: "checkout" });
    const url = new URL("/", window.location.origin).href;
    try {
      if (navigator.share)
        await navigator.share({
          title: "A noite não acaba aqui. | Jola",
          text: "Acabou a bebida? Ajuda a escolher onde a Jola vai começar. Entra na lista de acesso antecipado. 🍺",
          url,
        });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        notify("Link copiado. Manda ao grupo!");
      } else notify(`Partilha este link: ${url}`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        notify("Não foi possível partilhar. Copia o endereço da página.");
    }
  }
  const empty = ready && !items.length && !interest && step !== "success";
  return (
    <>
      <header className="checkout-header container">
        <Wordmark />
        <span>
          <ShieldCheck size={16} />
          Sem pagamento. Sem compromisso.
        </span>
      </header>
      <main
        id="main"
        className={`container checkout-layout ${step === "success" ? "checkout-success-layout" : ""}`}
      >
        <div className="checkout-main">
          <Link className="back-link" href="/pedir">
            <ArrowLeft size={16} />
            Voltar à noite
          </Link>
          {!ready ? (
            <div className="checkout-loading" role="status">
              A preparar a tua noite…
            </div>
          ) : empty ? (
            <div className="checkout-empty">
              <CartContents />
            </div>
          ) : (
            <>
              {step !== "success" && (
                <ol className="checkout-steps" aria-label="Passos do pedido">
                  {!interest && (
                    <li className="done">
                      <Check size={13} />O teu carrinho
                    </li>
                  )}
                  <li
                    className={step === "location" ? "current" : "done"}
                    aria-current={step === "location" ? "step" : undefined}
                  >
                    {step === "contact" ? (
                      <Check size={13} />
                    ) : (
                      <span>{interest ? 1 : 2}</span>
                    )}
                    A tua zona
                  </li>
                  <li
                    className={step === "contact" ? "current" : ""}
                    aria-current={step === "contact" ? "step" : undefined}
                  >
                    <span>{interest ? 2 : 3}</span>Acesso antecipado
                  </li>
                </ol>
              )}
              <div key={step} className="checkout-step">
                {step === "location" && (
                  <>
                    <div className="checkout-icon">
                      <MapPin size={26} />
                    </div>
                    <h1 ref={headingRef} tabIndex={-1}>
                      Qual é a tua zona?
                    </h1>
                    <p className="checkout-description">
                      A Jola está em preparação.{" "}
                      {interest
                        ? "A tua cidade ajuda-nos"
                        : "O teu carrinho e a tua zona ajudam-nos"}{" "}
                      a escolher onde lançar primeiro.
                    </p>
                    <p className="checkout-explainer">
                      Aqui guardas o teu interesse e podes entrar na lista de
                      acesso antecipado. Não há pagamento nem entrega nesta
                      fase.
                    </p>
                    <form
                      className="form-stack checkout-form"
                      onSubmit={locationSubmit}
                      aria-busy={busy}
                    >
                      <label>
                        Cidade
                        <input
                          name="city"
                          value={city}
                          disabled={busy}
                          onChange={(event) => {
                            setCity(event.target.value);
                            writeJourney(`jola_address:${scope}`, {
                              city: event.target.value,
                              postcode,
                            });
                          }}
                          placeholder="Lisboa"
                          autoComplete="address-level2"
                          required
                          minLength={2}
                          maxLength={80}
                          aria-describedby={
                            error ? "checkout-error" : undefined
                          }
                        />
                      </label>
                      <label>
                        Código postal
                        <input
                          name="postcode"
                          value={postcode}
                          disabled={busy}
                          onChange={(event) => {
                            const next = formatPostcode(event.target.value);
                            setPostcode(next);
                            writeJourney(`jola_address:${scope}`, {
                              city,
                              postcode: next,
                            });
                          }}
                          placeholder="1000-001"
                          autoComplete="postal-code"
                          inputMode="numeric"
                          required
                          pattern="[0-9]{4}-[0-9]{3}"
                          maxLength={8}
                          aria-describedby={`postcode-hint${error ? " checkout-error" : ""}`}
                        />
                        <small id="postcode-hint">
                          Escreve os 7 algarismos. Não precisamos da tua morada.
                        </small>
                      </label>
                      {error && (
                        <p
                          id="checkout-error"
                          ref={errorRef}
                          tabIndex={-1}
                          className="form-error"
                          role="alert"
                        >
                          {error}
                        </p>
                      )}
                      <button
                        className="button button-primary"
                        disabled={busy || !ageConfirmed}
                      >
                        {busy
                          ? "A guardar a tua zona…"
                          : "Guardar zona e continuar"}
                        <ArrowRight size={18} />
                      </button>
                      <p className="form-footnote">
                        Podes alterar a zona no próximo passo.
                      </p>
                    </form>
                  </>
                )}
                {step === "contact" && (
                  <>
                    <span className="launch-badge">
                      <span />
                      Acesso antecipado · lançamento por zonas
                    </span>
                    <h1 ref={headingRef} tabIndex={-1}>
                      A primeira Jola
                      <br />
                      <span>começa contigo.</span>
                    </h1>
                    <p className="checkout-description">
                      {interest
                        ? "A tua zona conta."
                        : "O teu carrinho ficou guardado e ajuda-nos a preparar a oferta."}{" "}
                      Vamos lançar zona a zona. Deixa o teu contacto para seres
                      dos primeiros a saber quando chegarmos à tua.
                    </p>
                    <p className="checkout-zone-note">
                      <strong>5 € previstos na tua primeira Jola.</strong> A
                      oferta será confirmada com as condições do lançamento.
                      Ainda não há data definida nem encomenda em curso.
                    </p>
                    <div className="selected-location">
                      <MapPin size={16} />
                      {location?.city} · {location?.postcode}
                      <button
                        onClick={() => {
                          saveStep("location");
                        }}
                        disabled={busy}
                      >
                        Alterar
                      </button>
                    </div>
                    <form
                      className="form-stack checkout-form"
                      onSubmit={contactSubmit}
                      aria-busy={busy}
                    >
                      <div
                        className="contact-tabs"
                        aria-label="Como preferes ser contactado?"
                      >
                        <button
                          type="button"
                          className={mode === "email" ? "active" : ""}
                          aria-pressed={mode === "email"}
                          disabled={busy}
                          onClick={() => chooseMode("email")}
                        >
                          <Mail size={16} />
                          Email
                        </button>
                        <button
                          type="button"
                          className={mode === "phone" ? "active" : ""}
                          aria-pressed={mode === "phone"}
                          disabled={busy}
                          onClick={() => chooseMode("phone")}
                        >
                          <Smartphone size={16} />
                          Telemóvel
                        </button>
                      </div>
                      <label>
                        {mode === "email"
                          ? "O teu email"
                          : "O teu número de telemóvel"}
                        <input
                          name="contact"
                          type={mode === "email" ? "email" : "tel"}
                          inputMode={mode === "email" ? "email" : "tel"}
                          autoComplete={mode === "email" ? "email" : "tel"}
                          required
                          maxLength={180}
                          value={draft[mode]}
                          disabled={busy}
                          onChange={(event) =>
                            saveDraft({ ...draft, [mode]: event.target.value })
                          }
                          aria-describedby={
                            error ? "checkout-error" : undefined
                          }
                          placeholder={
                            mode === "email" ? "tu@email.pt" : "912 345 678"
                          }
                        />
                      </label>
                      <input
                        className="honeypot"
                        name="website"
                        tabIndex={-1}
                        autoComplete="off"
                        aria-hidden="true"
                      />
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          name="consent"
                          required
                          checked={draft.consent}
                          disabled={busy}
                          onChange={(event) =>
                            saveDraft({
                              ...draft,
                              consent: event.target.checked,
                            })
                          }
                        />
                        <span>
                          Quero receber novidades sobre o lançamento da Jola e
                          li a{" "}
                          <Link href="/privacidade" target="_blank">
                            Privacidade
                          </Link>
                          .
                        </span>
                      </label>
                      {error && (
                        <p
                          id="checkout-error"
                          ref={errorRef}
                          tabIndex={-1}
                          role="alert"
                          className="form-error"
                        >
                          {error}
                        </p>
                      )}
                      <button
                        className="button button-primary"
                        disabled={busy || !ageConfirmed}
                      >
                        {busy
                          ? "A guardar o teu lugar…"
                          : "Quero acesso antecipado"}
                        <ArrowUpRight size={18} />
                      </button>
                      <p className="form-footnote">
                        Só boas notícias. Podes retirar o consentimento a
                        qualquer momento.
                      </p>
                    </form>
                  </>
                )}
                {step === "success" && (
                  <div className="success-content">
                    <div className="success-cheers" aria-hidden="true">
                      🍻
                    </div>
                    <span className="launch-badge">
                      <Check size={14} />
                      Lugar guardado.
                    </span>
                    <h1 ref={headingRef} tabIndex={-1}>
                      Estás dentro.
                    </h1>
                    <p>
                      Quando a Jola chegar à tua zona,
                      <br />
                      vais ser dos primeiros a saber.
                    </p>
                    <div className="offer-ticket">
                      <div>
                        <small>A tua primeira noite com a Jola</small>
                        <strong>
                          5 € <span>de oferta</span>
                        </strong>
                        <p>
                          Oferta prevista para o lançamento na tua zona.
                          Confirmamos as condições nessa altura.
                        </p>
                      </div>
                      <span className="ticket-wordmark">JOLA</span>
                    </div>
                    <button className="button button-primary" onClick={share}>
                      Mandar ao grupo
                      <MessageCircle size={19} />
                    </button>
                    <Link href="/" className="text-link">
                      Até à próxima Jola
                      <ArrowUpRight size={17} />
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        {step !== "success" && !empty && (
          <aside className="checkout-summary">
            {interest ? (
              <div className="waitlist-aside">
                <span>JOLA</span>
                <h2>
                  A tua cidade.
                  <br />A tua noite.
                  <br />A tua Jola.
                </h2>
                <p>Ajudas-nos a escolher onde começar.</p>
                <MapPin size={48} strokeWidth={1} />
              </div>
            ) : (
              <>
                <div className="cart-heading">
                  <h2>A tua noite</h2>
                  <span>{priced.item_count} artigos</span>
                </div>
                <CartContents review editingDisabled={busy} />
                <div className="checkout-offer-note">
                  A tua seleção ajuda-nos a escolher o catálogo de lançamento.
                  <strong>Acesso antecipado + oferta prevista de 5 €.</strong>
                </div>
                <span className="sr-only">
                  Total do pedido: {money(priced.total)}
                </span>
              </>
            )}
          </aside>
        )}
      </main>
      <footer className="checkout-footer">
        Jola é um conceito em validação. Não há vendas, cobranças ou entregas
        nesta fase.
      </footer>
    </>
  );
}
