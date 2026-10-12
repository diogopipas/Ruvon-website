"use client";
import Script from "next/script";
import { useEffect, useState } from "react";
type Manifest = { id: string; session: string; config: unknown };
declare global {
  interface Window {
    easypayCheckout?: {
      startCheckout: (
        manifest: Manifest,
        options: Record<string, unknown>,
      ) => { unmount: () => void };
    };
  }
}
export function CardAuthorisation({ id }: { id: string }) {
  const [ready, setReady] = useState(false),
    [manifest, setManifest] = useState<Manifest | null>(null),
    [testing, setTesting] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const r = await fetch(`/api/commerce/orders/${id}/payment`, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        if (r.ok) {
          const data = await r.json();
          if (active && data.manifest) {
            setManifest(data.manifest);
            setTesting(data.testing);
            return;
          }
        }
      } catch {
        if (active) setError("A preparar o formulário de pagamento.");
      }
      if (active) timer = setTimeout(load, 5000);
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id]);
  useEffect(() => {
    if (!ready || !manifest || !window.easypayCheckout) return;
    const instance = window.easypayCheckout.startCheckout(manifest, {
      testing,
      language: "pt_PT",
      id: "easypay-checkout",
      onError: () =>
        setError(
          "Não foi possível concluir. Aguarda a verificação do mesmo pedido.",
        ),
      onSuccess: () => setError(""),
    });
    return () => instance.unmount();
  }, [manifest, ready, testing]);
  if (!manifest) return null;
  return (
    <section aria-label="Autorização por cartão">
      <Script
        src="https://cdn.easypay.pt/checkout/2.9.1/"
        onReady={() => setReady(true)}
        onError={() => setError("Não foi possível abrir o formulário seguro.")}
      />
      <div id="easypay-checkout" />
      <p role="alert">{error}</p>
    </section>
  );
}
