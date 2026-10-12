"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client-request";
export function MerchantLogin() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    router = useRouter();
  return (
    <main id="main" className="container commerce-page">
      <h1>A tua loja, na Ruvon.</h1>
      <p>Entra com a tua conta pessoal.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const data = new FormData(e.currentTarget);
          try {
            await postJson("/api/merchant/login", {
              email: data.get("email"),
              password: data.get("password"),
            });
            router.push("/merchant");
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Não foi possível entrar.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Palavra-passe
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button className="button button-primary" disabled={busy}>
          Entrar
        </button>
        <p role="alert">{error}</p>
      </form>
    </main>
  );
}
