"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Mail, MapPin, Smartphone } from "lucide-react";
import { useCart } from "@/components/providers";
import { Wordmark } from "@/components/ui/wordmark";
import { CartContents } from "@/components/cart/cart";
import { CitySelect } from "@/components/ui/city-select";
import { basketPackEvents } from "@/lib/packs";
import { attribution, getSession, track, trackOnce } from "@/lib/analytics";
import { postJson } from "@/lib/client-request";
import {
  checkoutKey,
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
  const { items, ready, ageConfirmed, location, setLocation, syncOrder } =
    useCart();
  const [step, setStep] = useState<Step>("location");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [city, setCity] = useState("");
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
    const address = readJourney<{ city?: string } | null>(
      `jola_address:${scope}`,
      null,
    );
    const savedCity =
      typeof address?.city === "string"
        ? address.city
        : chosenCity || location?.city || "";
    setCity(savedCity);
    writeJourney(`jola_address:${scope}`, { city: savedCity });
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
      setError("Confirma que queres receber avisos de disponibilidade.");
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
          ...basketPackEvents(interest ? [] : items),
          city: location.city,
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
  const empty = ready && !items.length && !interest && step !== "success";
  return (
    <>
      <header className="checkout-header container">
        <Wordmark />
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
                    <span>{interest ? 2 : 3}</span>O teu contacto
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
                      Seleciona a tua cidade para associar o teu interesse à
                      zona onde queres receber.
                    </p>
                    <p className="checkout-explainer">
                      Este formulário regista o teu interesse. Não conclui uma
                      compra, não cobra pagamentos nem reserva uma entrega.
                    </p>
                    <form
                      className="form-stack checkout-form"
                      onSubmit={locationSubmit}
                      aria-busy={busy}
                    >
                      <label>
                        Cidade
                        <CitySelect
                          name="city"
                          value={city}
                          disabled={busy}
                          onChange={(event) => {
                            setCity(event.target.value);
                            writeJourney(`jola_address:${scope}`, {
                              city: event.target.value,
                            });
                          }}
                          aria-describedby={
                            error ? "checkout-error" : undefined
                          }
                        />
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
                      </button>
                      <p className="form-footnote">
                        Podes alterar a zona no próximo passo.
                      </p>
                    </form>
                  </>
                )}
                {step === "contact" && (
                  <>
                    <h1 ref={headingRef} tabIndex={-1}>
                      Regista o teu interesse.
                    </h1>
                    <p className="checkout-description">
                      {interest
                        ? "A tua zona conta."
                        : "O teu carrinho ficou guardado."}{" "}
                      Deixa o teu contacto para receber avisos de
                      disponibilidade na tua zona.
                    </p>
                    <div className="selected-location">
                      <MapPin size={16} />
                      {location?.city}
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
                          Quero receber avisos de disponibilidade da Ruvon na
                          minha zona e li a{" "}
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
                          ? "A guardar o teu contacto…"
                          : "Registar interesse"}
                      </button>
                    </form>
                  </>
                )}
                {step === "success" && (
                  <div className="success-content">
                    <div className="success-mark" aria-hidden="true">
                      <Check size={34} strokeWidth={2.2} />
                    </div>
                    <span className="success-eyebrow">
                      Inscrição confirmada
                    </span>
                    <h1 ref={headingRef} tabIndex={-1}>
                      Interesse registado.
                    </h1>
                    <p>
                      Guardámos o teu contacto para te avisar sobre a
                      disponibilidade na tua zona.
                    </p>
                    {location && (
                      <div className="success-zone">
                        <MapPin size={17} />
                        <span>{location.city}</span>
                      </div>
                    )}
                    <Link href="/" className="text-link">
                      Voltar ao início
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
                <span>RUVON</span>
                <h2>
                  A tua cidade.
                  <br />A tua noite.
                  <br />A tua Ruvon.
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
                <span className="sr-only">
                  Total do pedido: {money(priced.total)}
                </span>
              </>
            )}
          </aside>
        )}
      </main>
      <footer className="checkout-footer">
        Ruvon é um conceito em validação. Não há vendas, cobranças ou entregas
        nesta fase.
      </footer>
    </>
  );
}
