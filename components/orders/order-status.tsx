"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { OrderState, OrderView } from "@/lib/commerce";
import { money } from "@/lib/pricing";
import { postJson } from "@/lib/client-request";
import { CardAuthorisation } from "./card-authorisation";
import { readLocal, writeLocal } from "@/lib/analytics";
import { parseCommerceCart, confirmCommerceCart } from "@/lib/commerce-cart";
import type { CartItem } from "@/types";
const labels: Record<OrderState, string> = {
  awaiting_payment: "A aguardar autorização do pagamento",
  awaiting_merchant: "A loja está a confirmar o teu pedido",
  confirming: "A confirmar o pedido",
  preparing: "A preparar a tua noite",
  ready_for_pickup: "Pronto para recolha",
  in_delivery: "A caminho da tua porta",
  delivered: "Entregue",
  completed: "Pedido concluído",
  cancelling: "A confirmar o cancelamento",
  cancelled: "Pedido cancelado",
  returning: "A regressar à loja",
  returned: "Devolução recebida",
  manual_review: "Estamos a resolver uma situação com o teu pedido",
};
export function OrderStatus({
  id,
  environment,
}: {
  id: string;
  environment: "sandbox" | "live";
}) {
  const [order, setOrder] = useState<OrderView | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [issueType, setIssueType] = useState("missing_item");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/commerce/orders/${id}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
          throw new Error(
            "Não conseguimos consultar agora. O pedido continua guardado neste dispositivo.",
          );
        const data = await response.json();
        if (active) {
          setOrder(data);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "A confirmar o estado do pedido.",
          );
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);
  useEffect(() => {
    if (
      !order ||
      ![
        "preparing",
        "ready_for_pickup",
        "in_delivery",
        "delivered",
        "completed",
        "returning",
        "returned",
      ].includes(order.operational_status)
    )
      return;
    const key = `ruvon_${environment}_commerce_cart`;
    const current = parseCommerceCart(readLocal(key, null));
    const next = confirmCommerceCart(
      current,
      order.id,
      order.items as CartItem[],
    );
    if (next !== current) writeLocal(key, next);
  }, [order, environment]);
  async function cancel() {
    if (!order || !reason.trim()) return;
    setBusy(true);
    try {
      await postJson(`/api/commerce/orders/${id}/cancel`, {
        command_id: crypto.randomUUID(),
        expected_version: order.version,
        reason,
      });
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível guardar.");
    } finally {
      setBusy(false);
    }
  }
  async function reportIssue() {
    if (!order || reason.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      await postJson(`/api/commerce/orders/${id}/issues`, {
        command_id: crypto.randomUUID(),
        expected_version: order.version,
        type: issueType,
        reason,
        evidence: [],
      });
      setReason("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível registar a situação.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="container commerce-page">
      <Link href="/pedir">Ruvon</Link>
      <h1>O teu pedido</h1>
      <p role="alert">{error}</p>
      {!order ? (
        <p role="status">A recuperar o pedido…</p>
      ) : (
        <>
          <p className="commerce-status" role="status">
            {labels[order.operational_status]}
          </p>
          {order.operational_status === "awaiting_payment" && (
            <CardAuthorisation id={id} />
          )}
          {order.operational_status === "awaiting_payment" &&
            ["authorisation_pending", "unknown"].includes(
              order.payment_status,
            ) && (
              <p>
                Se escolheste MB WAY, confirma o pedido na aplicação. Estamos a
                verificar a autorização; mantém este mesmo pedido guardado.
              </p>
            )}
          {order.operational_status === "awaiting_payment" &&
            ["failed", "expired"].includes(order.payment_status) && (
              <p>
                A autorização não foi concluída. Cancela este pedido para voltar
                ao carrinho e obter uma nova cotação.
              </p>
            )}
          {order.operational_status === "awaiting_merchant" && (
            <p>
              A autorização reserva o valor. A loja ainda precisa de aceitar o
              pedido.
            </p>
          )}
          {order.tracking_url && (
            <a
              className="button button-secondary"
              href={order.tracking_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Acompanhar estafeta
            </a>
          )}
          <article className="commerce-card">
            <ul>
              {order.items.map((i) => (
                <li key={i.id}>
                  {i.quantity} × {i.name} — {money(i.line_price)}
                </li>
              ))}
            </ul>
            <dl className="commerce-receipt">
              <div>
                <dt>Produtos</dt>
                <dd>{money(order.subtotal)}</dd>
              </div>
              <div>
                <dt>Entrega</dt>
                <dd>{money(order.delivery_fee)}</dd>
              </div>
              <div>
                <dt>Taxa Ruvon</dt>
                <dd>{money(order.service_fee)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{money(order.total)}</dd>
              </div>
              {order.refunded > 0 && (
                <div>
                  <dt>Reembolso confirmado</dt>
                  <dd>{money(order.refunded)}</dd>
                </div>
              )}
            </dl>
          </article>
          {order.allowed_actions.includes("report_issue") && (
            <section>
              <h2>Precisas de ajuda com o pedido?</h2>
              <label>
                O que aconteceu?
                <select
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value)}
                >
                  <option value="missing_item">Falta um artigo</option>
                  <option value="wrong_item">Artigo errado</option>
                  <option value="damaged">Artigo danificado</option>
                  <option value="delivery">Problema com a entrega</option>
                  <option value="other">Outra situação</option>
                </select>
              </label>
              <label>
                Descreve a situação
                <textarea
                  maxLength={400}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                className="button button-secondary"
                disabled={busy || reason.trim().length < 3}
                onClick={reportIssue}
              >
                Pedir análise
              </button>
            </section>
          )}
          {order.allowed_actions.some((a) =>
            ["cancel", "request_review"].includes(a),
          ) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void cancel();
              }}
            >
              <label>
                Motivo do cancelamento
                <textarea
                  required
                  maxLength={400}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <p>
                {order.allowed_actions.includes("cancel")
                  ? "Antes de a loja aceitar, o cancelamento é automático. Aguarda a confirmação da libertação ou devolução do valor."
                  : "A loja já aceitou. Vamos analisar o teu pedido de cancelamento; a entrega pode continuar enquanto resolvemos a situação."}
              </p>
              <button disabled={busy} className="button button-secondary">
                {order.allowed_actions.includes("cancel")
                  ? "Cancelar pedido"
                  : "Pedir análise do cancelamento"}
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
