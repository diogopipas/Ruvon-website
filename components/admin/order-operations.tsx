"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { OrderView } from "@/lib/commerce";
import { money } from "@/lib/pricing";
import { HttpResponseError, postJson } from "@/lib/client-request";
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
  refunds: {
    id: string;
    amount: number;
    status: string;
    reason: string;
    allocation: { products: number; service: number; delivery: number };
  }[];
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
  notifications: {
    id: string;
    channel: string;
    purpose: string;
    status: string;
    last_error: string | null;
  }[];
};
type CommandInput = {
  command_id: string;
  expected_version: number;
  command: string;
  reason: string;
  confirmed: true;
  reference_id?: string;
  amount?: number;
  allocation?: Record<string, number>;
  resolution?: Record<string, string>;
};
type Attempt = {
  input: CommandInput;
  phase: "pending" | "confirmed" | "rejected";
  busy: boolean;
  error: string;
};
export function OrderOperations({ id }: { id?: string }) {
  const [orders, setOrders] = useState<Summary[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [attempt, setAttempt] = useState<Attempt | null>(null);
  const pending = useRef<Attempt | null>(null),
    mounted = useRef(false),
    accessDenied = useRef(false),
    readSequence = useRef(0),
    appliedRead = useRef(0);
  const busy = attempt !== null;
  const refundPending =
    detail?.refunds.some((r) =>
      ["requested", "processing", "unknown"].includes(r.status),
    ) ?? false;
  const clearSession = useCallback(() => {
    accessDenied.current = true;
    pending.current = null;
    setAttempt(null);
    setDetail(null);
    setOrders([]);
    setMessage("");
    setError("A sessão terminou ou perdeu acesso. Inicia sessão novamente.");
  }, []);
  const load = useCallback(async () => {
    if (accessDenied.current)
      throw new HttpResponseError("Inicia sessão novamente.", 401);
    const sequence = ++readSequence.current;
    const r = await fetch(
      id ? `/api/admin/orders/${id}` : "/api/admin/orders",
      { cache: "no-store", signal: AbortSignal.timeout(10000) },
    );
    if (!mounted.current) return;
    if (r.status === 401 || r.status === 403) {
      clearSession();
      throw new HttpResponseError("Inicia sessão novamente.", r.status);
    }
    if (!r.ok) throw new Error("Não foi possível atualizar os pedidos.");
    const data = await r.json();
    if (!mounted.current) return;
    if (accessDenied.current)
      throw new HttpResponseError("Inicia sessão novamente.", 401);
    if (sequence < appliedRead.current) return;
    appliedRead.current = sequence;
    if (id) setDetail(data);
    else setOrders(data);
    setError("");
  }, [id, clearSession]);
  useEffect(() => {
    mounted.current = true;
    let stopped = false,
      polling = false;
    async function refresh() {
      if (stopped || polling || accessDenied.current || document.hidden) return;
      polling = true;
      try {
        await load();
      } catch (e) {
        if (!stopped && !accessDenied.current)
          setError(
            e instanceof Error ? e.message : "Não foi possível carregar.",
          );
      } finally {
        polling = false;
      }
    }
    void refresh();
    const timer = setInterval(refresh, 10000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      mounted.current = false;
      pending.current = null;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  async function send(current: Attempt) {
    if (
      !id ||
      !mounted.current ||
      accessDenied.current ||
      current.busy ||
      pending.current !== current
    )
      return;
    const valid = () =>
      mounted.current && !accessDenied.current && pending.current === current;
    current.busy = true;
    current.error = "";
    setAttempt({ ...current });
    try {
      if (current.phase === "pending") {
        await postJson(`/api/admin/orders/${id}/commands`, current.input);
        if (!valid()) return;
        current.phase = "confirmed";
      }
      await load();
      if (!valid()) return;
      pending.current = null;
      setAttempt(null);
      setMessage(
        current.phase === "rejected"
          ? "Pedido atualizado. Revê o estado antes de escolher outra ação."
          : "Ação registada e pedido atualizado. O resultado do prestador continua no histórico.",
      );
    } catch (e) {
      if (!valid()) return;
      if (e instanceof HttpResponseError) {
        if (e.status === 401 || e.status === 403) {
          clearSession();
          return;
        }
        if (
          current.phase === "pending" &&
          [400, 404, 409, 413, 415, 422].includes(e.status)
        )
          current.phase = "rejected";
      }
      current.error =
        e instanceof Error ? e.message : "Não foi possível confirmar a ação.";
    } finally {
      current.busy = false;
      if (valid()) setAttempt({ ...current });
    }
  }
  async function command(
    command: string,
    reference?: string,
    amount?: number,
    allocation?: Record<string, number>,
    resolution?: Record<string, string>,
  ) {
    if (
      !detail ||
      !id ||
      pending.current ||
      accessDenied.current ||
      (command === "refund" && refundPending)
    )
      return;
    const reason = window.prompt(
      "Motivo obrigatório para o registo de auditoria:",
    );
    if (!reason) return;
    if (reason.trim().length < 3 || reason.trim().length > 400) {
      setError("Indica um motivo entre 3 e 400 caracteres.");
      return;
    }
    if (
      command === "refund" &&
      !window.confirm(
        `Confirmar reembolso de ${money(amount!)}?\nProdutos: ${money(allocation?.products ?? 0)} · Taxa Ruvon: ${money(allocation?.service ?? 0)} · Entrega: ${money(allocation?.delivery ?? 0)}\nSaldo disponível: ${money(detail.remaining_refundable)}. Após esta reserva: ${money(detail.remaining_refundable - amount!)}.\nRecuperação à loja: separada e ainda por confirmar${["released", "bank_settlement_pending", "settled"].includes(detail.order.settlement_status) ? "; a alocação já foi libertada" : ""}.\nMotivo: ${reason.trim()}`,
      )
    )
      return;
    const current: Attempt = {
      phase: "pending",
      busy: false,
      error: "",
      input: Object.freeze({
        command_id: crypto.randomUUID(),
        expected_version: detail.order.version,
        command,
        reason: reason.trim(),
        confirmed: true,
        ...(reference ? { reference_id: reference } : {}),
        ...(amount
          ? { amount, allocation: Object.freeze({ ...allocation }) }
          : {}),
        ...(resolution
          ? {
              resolution: Object.freeze({
                ...resolution,
                summary: reason.trim(),
              }),
            }
          : {}),
      }),
    };
    pending.current = current;
    setMessage("");
    setError("");
    void send(current);
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
      <Link href="/admin/orders/health">Saúde, falhas e pausas de loja</Link>
      <Link href="/merchant/login">Entrar com conta pessoal</Link>
      <p role="alert">{error}</p>
      {message && <p role="status">{message}</p>}
      {attempt && (
        <section className="commerce-card" aria-label="Ação em recuperação">
          <p role="status">
            {attempt.phase === "pending"
              ? "A confirmar a mesma ação. Aguarda antes de iniciar outra."
              : "A atualizar o estado do pedido."}
          </p>
          {attempt.input.command === "refund" && (
            <p>
              Reembolso solicitado: {money(attempt.input.amount!)} ·{" "}
              {attempt.input.reason}
            </p>
          )}
          {attempt.error && <p role="alert">{attempt.error}</p>}
          <button
            className="button button-secondary"
            disabled={attempt.busy}
            onClick={() => pending.current && void send(pending.current)}
          >
            {attempt.phase === "pending"
              ? "Repetir a mesma ação"
              : "Atualizar pedido"}
          </button>
        </section>
      )}
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
            {refundPending && (
              <p role="status">
                Há um reembolso por confirmar. Consulta o histórico e reconcilia
                a mesma operação antes de criar outro.
              </p>
            )}
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
                disabled={busy || refundPending || !detail.remaining_refundable}
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
                      disabled={busy || refundPending}
                    />
                  </label>
                ))}
                <button
                  className="button button-secondary"
                  disabled={busy || refundPending}
                >
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
            <h2>Reembolsos</h2>
            {detail.refunds.map((r) => (
              <article key={r.id} className="commerce-card">
                <p>
                  {money(r.amount)} ·{" "}
                  {(
                    {
                      requested: "Solicitado",
                      processing: "Em processamento",
                      unknown: "Resultado por confirmar",
                      succeeded: "Confirmado pelo prestador",
                      failed: "Falhou",
                    } as Record<string, string>
                  )[r.status] ?? r.status}
                </p>
                <p>
                  Produtos: {money(r.allocation.products)} · Taxa Ruvon:{" "}
                  {money(r.allocation.service)} · Entrega:{" "}
                  {money(r.allocation.delivery)}
                </p>
                <p>{r.reason}</p>
                <p>Recuperação à loja tratada separadamente.</p>
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
            <h2>Notificações</h2>
            <p>
              «Aceite para envio» confirma a receção pelo prestador. «Entregue»
              confirma a entrega ao servidor de email do destinatário.
            </p>
            {detail.notifications?.map((n) => (
              <p key={n.id}>
                {n.channel} · {n.purpose} ·{" "}
                {n.status === "sent"
                  ? "Aceite para envio"
                  : n.status === "delivered"
                    ? "Entregue"
                    : n.status}{" "}
                · {n.last_error}
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
