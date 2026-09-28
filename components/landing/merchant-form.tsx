"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { readLocal, writeLocal } from "@/lib/analytics";
import { postJson } from "@/lib/client-request";
import { contactSchema } from "@/lib/validation";

export default function MerchantForm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const contact = contactSchema.safeParse(data.contact);
    if (!contact.success) {
      setError(contact.error.issues[0].message);
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const encoded = new TextEncoder().encode(
        JSON.stringify({ ...data, contact: contact.data }),
      );
      const digest = await crypto.subtle.digest("SHA-256", encoded);
      const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const saved = readLocal<{ id: string; fingerprint: string } | null>(
        "jola_merchant_submission",
        null,
      );
      const submissionId =
        saved?.fingerprint === fingerprint && typeof saved.id === "string"
          ? saved.id
          : crypto.randomUUID();
      writeLocal("jola_merchant_submission", { id: submissionId, fingerprint });
      await postJson("/api/merchants", {
        ...data,
        contact: contact.data,
        consent: data.consent === "on",
        submission_id: submissionId,
      });
      writeLocal("jola_merchant_submission", null);
      setSuccess(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível guardar. Tenta novamente.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={success ? "Vamos falar." : "A próxima Jola pode sair da tua loja."}
      description={
        success
          ? "Recebemos o teu interesse. Entraremos em contacto quando prepararmos o lançamento na tua zona."
          : "Mercearias, garrafeiras e lojas de bairro: há lugar para ti."
      }
    >
      {success ? (
        <div className="form-success" role="status">
          <Check size={36} aria-hidden="true" />
          <button
            className="button button-primary"
            onClick={() => onOpenChange(false)}
          >
            Combinado
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="form-stack" aria-busy={busy}>
          <label>
            Nome da loja
            <input
              name="store_name"
              required
              minLength={2}
              maxLength={120}
              autoComplete="organization"
              placeholder="A tua loja"
            />
          </label>
          <label>
            Cidade
            <input
              name="city"
              required
              minLength={2}
              maxLength={80}
              autoComplete="address-level2"
              placeholder="Cidade da loja"
            />
          </label>
          <label>
            O teu nome
            <input
              name="contact_name"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              placeholder="Como te chamas?"
            />
          </label>
          <label>
            Email ou telemóvel
            <input
              name="contact"
              required
              maxLength={180}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="ola@loja.pt ou 912 345 678"
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
              Quero que a Jola me contacte sobre a parceria e li a{" "}
              <a href="/privacidade" target="_blank" rel="noreferrer">
                Privacidade
              </a>
              .
            </span>
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button disabled={busy} className="button button-primary">
            {busy ? "A guardar…" : "Quero ser parceiro"}
          </button>
        </form>
      )}
    </Modal>
  );
}
