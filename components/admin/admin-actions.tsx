"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, LogOut, RefreshCw } from "lucide-react";
export function AdminLogin({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const password = new FormData(event.currentTarget).get("password");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Não foi possível entrar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-login">
      <div className="checkout-icon">
        <LockKeyhole size={23} />
      </div>
      <h1>
        Nos bastidores
        <br />
        da próxima noite.
      </h1>
      <p>O pulso da Jola, numa só página.</p>
      {!configured ? (
        <p className="form-error">
          Define ADMIN_PASSWORD com pelo menos 12 caracteres para ativar o
          acesso.
        </p>
      ) : (
        <form onSubmit={submit} className="form-stack">
          <label>
            Palavra-passe
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
              placeholder="Acesso reservado"
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="button button-primary" disabled={busy}>
            {busy ? "A entrar…" : "Entrar no painel"}
            <ArrowRight size={17} />
          </button>
        </form>
      )}
    </div>
  );
}
export function AdminActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError("Não foi possível sair. Tenta novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-actions">
      <button
        className="button button-secondary button-small"
        onClick={() => router.refresh()}
      >
        <RefreshCw size={14} />
        Atualizar
      </button>
      <button
        className="icon-button"
        onClick={logout}
        disabled={busy}
        aria-label="Sair do painel"
      >
        <LogOut size={18} />
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
