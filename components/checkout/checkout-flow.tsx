"use client";
import { useEffect, useState } from "react";
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
import { motion } from "framer-motion";
import { useCart } from "@/components/providers";
import { Wordmark } from "@/components/ui/wordmark";
import { CartContents } from "@/components/cart/cart";
import {
  attribution,
  getSession,
  readLocal,
  track,
  writeLocal,
} from "@/lib/analytics";
import { money, priceBasket } from "@/lib/pricing";
import { contactSchema, locationSchema } from "@/lib/validation";
export function CheckoutFlow() {
  const params = useSearchParams();
  const interest = params.get("interesse") === "1";
  const chosenCity = params.get("cidade") || "";
  const { items, ready, location, setLocation, syncOrder, notify } = useCart();
  const [step, setStep] = useState<"location" | "contact" | "success">(
    "location",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"email" | "phone">("email");
  const priced = priceBasket(items);
  useEffect(() => {
    if (!ready) return;
    /* eslint-disable react-hooks/set-state-in-effect */ if (
      readLocal("jola_lead_done", false)
    )
      setStep("success");
    else if (
      readLocal<string>("jola_checkout_step", "") === "contact" &&
      location &&
      !interest
    )
      setStep("contact"); /* eslint-enable react-hooks/set-state-in-effect */
  }, [ready, location, interest]);
  async function locationSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = locationSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      if (!interest && items.length) await syncOrder(true, parsed.data);
      setLocation(parsed.data);
      track("location_entered", {
        ...parsed.data,
        basket_value: priced.subtotal / 100,
        item_count: priced.item_count,
      });
      writeLocal("jola_checkout_step", "contact");
      setStep("contact");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível guardar a zona. Tenta novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function contactSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = contactSchema.safeParse(form.contact);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (!location) {
      setStep("location");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: getSession(),
          items: interest ? [] : items,
          location,
          attribution: attribution(),
          contact: parsed.data,
          consent: form.consent === "on",
          website: form.website || "",
          reached_checkout: !interest,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      track("waitlist_submitted", {
        city: location.city,
        postcode: location.postcode,
        basket_value: interest ? 0 : priced.subtotal / 100,
        item_count: interest ? 0 : priced.item_count,
      });
      writeLocal("jola_lead_done", true);
      writeLocal("jola_checkout_step", "success");
      setStep("success");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não conseguimos guardar. Tenta novamente.",
      );
    } finally {
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
          text: "Acabou a bebida? A Jola está a chegar. Entra na lista e ganha 5 € na primeira Jola. 🍺",
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
                  <li className="done">
                    <Check size={13} />
                    {interest ? "A tua cidade" : "O teu carrinho"}
                  </li>
                  <li className={step === "location" ? "current" : "done"}>
                    {step === "contact" ? <Check size={13} /> : <span>2</span>}A
                    tua zona
                  </li>
                  <li className={step === "contact" ? "current" : ""}>
                    <span>3</span>A primeira Jola
                  </li>
                </ol>
              )}
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {step === "location" && (
                  <>
                    <div className="checkout-icon">
                      <MapPin size={26} />
                    </div>
                    <h1>Onde é a festa?</h1>
                    <p className="checkout-description">
                      Diz-nos a tua zona. A próxima boa noite pode começar aí.
                    </p>
                    <form
                      className="form-stack checkout-form"
                      onSubmit={locationSubmit}
                    >
                      <label>
                        Cidade
                        <input
                          name="city"
                          defaultValue={chosenCity || location?.city || ""}
                          placeholder="Lisboa"
                          autoComplete="address-level2"
                          required
                          minLength={2}
                          maxLength={80}
                        />
                      </label>
                      <label>
                        Código postal
                        <input
                          name="postcode"
                          defaultValue={location?.postcode || ""}
                          placeholder="1000-001"
                          autoComplete="postal-code"
                          inputMode="numeric"
                          required
                          pattern="[0-9]{4}-[0-9]{3}"
                          maxLength={8}
                        />
                        <small>Assim sabemos se já estamos perto de ti.</small>
                      </label>
                      {error && (
                        <p className="form-error" role="alert">
                          {error}
                        </p>
                      )}
                      <button className="button button-primary" disabled={busy}>
                        {busy ? "A verificar…" : "Ver disponibilidade"}
                        <ArrowRight size={18} />
                      </button>
                      <p className="form-footnote">
                        Estamos a validar a Jola. Este pedido é uma simulação.
                      </p>
                    </form>
                  </>
                )}
                {step === "contact" && (
                  <>
                    <span className="launch-badge">
                      <span />
                      As boas noites estão a chegar.
                    </span>
                    <h1>
                      Ainda não
                      <br />
                      chegámos aí.
                      <br />
                      <span>Mas estamos quase.</span>
                    </h1>
                    <p className="checkout-description">
                      Estamos a lançar a Jola zona a zona. Deixa o teu contacto
                      e oferecemos-te <strong>5 € na primeira Jola</strong>{" "}
                      quando chegarmos até ti.
                    </p>
                    <div className="selected-location">
                      <MapPin size={16} />
                      {location?.city} · {location?.postcode}
                      <button
                        onClick={() => {
                          setStep("location");
                          writeLocal("jola_checkout_step", "location");
                        }}
                      >
                        Alterar
                      </button>
                    </div>
                    <form
                      className="form-stack checkout-form"
                      onSubmit={contactSubmit}
                    >
                      <div
                        className="contact-tabs"
                        aria-label="Como preferes ser contactado?"
                      >
                        <button
                          type="button"
                          className={mode === "email" ? "active" : ""}
                          aria-pressed={mode === "email"}
                          onClick={() => setMode("email")}
                        >
                          <Mail size={16} />
                          Email
                        </button>
                        <button
                          type="button"
                          className={mode === "phone" ? "active" : ""}
                          aria-pressed={mode === "phone"}
                          onClick={() => setMode("phone")}
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
                          key={mode}
                          name="contact"
                          type={mode === "email" ? "email" : "tel"}
                          autoComplete={mode === "email" ? "email" : "tel"}
                          required
                          maxLength={180}
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
                        <input type="checkbox" name="consent" required />
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
                        <p role="alert" className="form-error">
                          {error}
                        </p>
                      )}
                      <button className="button button-primary" disabled={busy}>
                        {busy
                          ? "A guardar o teu lugar…"
                          : "Quero 5 € na primeira Jola"}
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
                    <h1>Estás dentro.</h1>
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
                        <p>Guardados para o lançamento na tua zona.</p>
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
              </motion.div>
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
                <CartContents review />
                <div className="checkout-offer-note">
                  A primeira ronda de boas notícias é por nossa conta.
                  <strong>5 € na primeira Jola.</strong>
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
