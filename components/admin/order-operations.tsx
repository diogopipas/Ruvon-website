"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { OrderView } from "@/lib/commerce";
import { money } from "@/lib/pricing";
import { postJson } from "@/lib/client-request";
import { providerCents } from "@/lib/payments";
type Summary = {
  id: string;
  operational_status: string;
  payment_status: string;
  settlement_status: string;
  review_reason: string | null;
  created_at: string;
};
type Detail = {
  order: OrderView;
  remaining_refundable: number;
  remaining_components: { products: number; service: number; delivery: number };
  events: {
    id: string;
    sequence: number;
    after_state: string;
    reason: string | null;
    created_at: string;
  }[];
  cases: { id: string; reason: string; state: string }[];
  operations: { id: string; kind: string; status: string }[];
  jobs: {
    id: string;
    kind: string;
    state: string;
    last_error: string | null;
  }[];
};
export function OrderOperations({ id }: { id?: string }) {
  const [orders, setOrders] = useState<Summary[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch(
      id ? `/api/admin/orders/${id}` : "/api/admin/orders",
      { cache: "no-store" },
    );
    if (!r.ok)
      throw new Error("Inicia sessão com uma conta de operações autorizada.");
    const data = await r.json();
    if (id) setDetail(data);
    else setOrders(data);
  }
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const r = await fetch(
          id ? `/api/admin/orders/${id}` : "/api/admin/orders",
          { cache: "no-store" },
        );
        if (!r.ok)
          throw new Error(
            "Inicia sessão com uma conta de operações autorizada.",
          );
        const data = await r.json();
        if (active) {
          if (id) setDetail(data);
          else setOrders(data);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Não foi possível carregar.",
          );
      }
    }
    void refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);
  async function command(
    command: string,
    reference?: string,
    amount?: number,
    allocation?: Record<string, number>,
    resolution?: Record<string, string>,
  ) {
    if (!detail || !id) return;
    const reason = window.prompt(
      "Motivo obrigatório para o registo de auditoria:",
    );
    if (!reason) return;
    if (
      command === "refund" &&
      !window.confirm(
        `Confirmar reembolso de ${money(amount!)}? Saldo disponível: ${money(detail.remaining_refundable)}. A recuperação à loja fica separada e pode exigir análise.`,
      )
    )
      return;
    setBusy(true);
    try {
      await postJson(`/api/admin/orders/${id}/commands`, {
        command_id: crypto.randomUUID(),
        expected_version: detail.order.version,
        command,
        reason,
        confirmed: true,
        ...(reference ? { reference_id: reference } : {}),
        ...(amount ? { amount, allocation } : {}),
        ...(resolution
          ? { resolution: { ...resolution, summary: reason } }
          : {}),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível guardar.");
    } finally {
      setBusy(false);
    }
  }
  async function partialRefund(form: HTMLFormElement) {
    const data = new FormData(form),
      allocation = Object.fromEntries(
        ["products", "service", "delivery"].map((key) => [
          key,
          providerCents(String(data.get(key) || "0")),
        ]),
      );
    if (Object.values(allocation).some((v) => v === null)) {
      setError("Indica valores em euros com até duas casas decimais.");
      return;
    }
    const amounts = allocation as Record<string, number>,
      amount = Object.values(amounts).reduce((s, v) => s + v, 0);
    if (amount > 0) await command("refund", undefined, amount, amounts);
  }
  return (
    <main id="main" className="container commerce-page">
      <h1>Operações · Pedidos</h1>
      <Link href="/merchant/login">Entrar com conta pessoal</Link>
      <p role="alert">{error}</p>
      {!id ? (
        <div className="commerce-grid">
          {orders.map((o) => (
            <article className="commerce-card" key={o.id}>
              <Link href={`/admin/orders/${o.id}`}>{o.id.slice(0, 8)}</Link>
              <p>
                {o.operational_status} · {o.payment_status}
              </p>
              <p>{o.settlement_status}</p>
              {o.review_reason && <strong>{o.review_reason}</strong>}
            </article>
          ))}
        </div>
      ) : (
        detail && (
          <>
            <h2>{detail.order.operational_status}</h2>
            <p>
              Pagamento: {detail.order.payment_status} · Liquidação:{" "}
              {detail.order.settlement_status}
            </p>
            <p>Reembolsável: {money(detail.remaining_refundable)}</p>
            <div className="commerce-actions">
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => command("cancel")}
              >
                Pedir cancelamento seguro
              </button>
              <button
                className="button button-secondary"
                disabled={busy || !detail.remaining_refundable}
                onClick={() =>
                  command(
                    "refund",
                    undefined,
                    detail.remaining_refundable,
                    detail.remaining_components,
                  )
                }
              >
                Rever reembolso total disponível
              </button>
            </div>
            {detail.remaining_refundable > 0 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void partialRefund(e.currentTarget);
                }}
              >
                <h2>Reembolso parcial</h2>
                <p>
                  Define os componentes a devolver. O valor já reservado por
                  outros reembolsos está excluído.
                </p>
                {(
                  [
                    ["products", "Produtos"],
                    ["service", "Taxa Ruvon"],
                    ["delivery", "Entrega"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label} · disponível{" "}
                    {money(detail.remaining_components[key])}
                    <input
                      name={key}
                      type="number"
                      min="0"
                      max={detail.remaining_components[key] / 100}
                      step="0.01"
                      defaultValue="0"
                      required
                      disabled={busy}
                    />
                  </label>
                ))}
                <button className="button button-secondary" disabled={busy}>
                  Rever e confirmar reembolso parcial
                </button>
              </form>
            )}
            <h2>Casos</h2>
            {detail.cases.map((c) => (
              <article key={c.id}>
                <p>
                  {c.reason} · {c.state}
                </p>
                {c.state === "open" && (
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => command("acknowledge", c.id)}
                  >
                    Assumir caso
                  </button>
                )}
                {c.state !== "resolved" && (
                  <div className="commerce-actions">
                    <button
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() =>
                        command("resolve", c.id, undefined, undefined, {
                          action: "resume",
                          responsible_party: "unknown",
                        })
                      }
                    >
                      Resolver e retomar com factos verificados
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() =>
                        command("resolve", c.id, undefined, undefined, {
                          action: "cancel",
                          responsible_party: "unknown",
                        })
                      }
                    >
                      Resolver com cancelamento seguro
                    </button>
                    <button
                      className="button button-quiet"
                      disabled={busy}
                      onClick={() =>
                        command("resolve", c.id, undefined, undefined, {
                          action: "record_only",
                          responsible_party: "unknown",
                        })
                      }
                    >
                      Registar resolução do caso
                    </button>
                  </div>
                )}
              </article>
            ))}
            <h2>Operações dos prestadores</h2>
            {detail.operations.map((o) => (
              <p key={o.id}>
                {o.kind} · {o.status}{" "}
                <button
                  className="button button-quiet"
                  disabled={busy}
                  onClick={() => command("retry", o.id)}
                >
                  Reconciliar a mesma operação
                </button>
              </p>
            ))}
            <h2>Trabalhos</h2>
            {detail.jobs.map((j) => (
              <p key={j.id}>
                {j.kind} · {j.state} · {j.last_error}
              </p>
            ))}
            <h2>Histórico</h2>
            <ol>
              {[...detail.events]
                .sort((a, b) => a.sequence - b.sequence)
                .map((e) => (
                  <li key={e.id}>
                    {new Date(e.created_at).toLocaleString("pt-PT")} ·{" "}
                    {e.after_state} · {e.reason}
                  </li>
                ))}
            </ol>
          </>
        )
      )}
    </main>
  );
}
