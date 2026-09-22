"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, LogOut, RefreshCw } from "lucide-react";
import { postJson } from "@/lib/client-request";
export function AdminLogin({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const password = new FormData(event.currentTarget).get("password");
    try {
      await postJson("/api/admin/login", { password });
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Não foi possível entrar.",
      );
    } finally {
      submitting.current = false;
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
        <form onSubmit={submit} className="form-stack" aria-busy={busy}>
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
  const [refreshing, startTransition] = useTransition();
  const submitting = useRef(false);
  async function logout() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await postJson("/api/admin/logout", {});
      router.refresh();
    } catch {
      setError("Não foi possível sair. Tenta novamente.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="admin-actions">
      <button
        className="button button-secondary button-small"
        onClick={() => startTransition(() => router.refresh())}
        disabled={refreshing || busy}
      >
        <RefreshCw size={14} />
        {refreshing ? "A atualizar…" : "Atualizar"}
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
