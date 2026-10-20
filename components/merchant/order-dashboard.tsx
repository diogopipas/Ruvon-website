"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CommerceLine, MerchantCommand, OrderState } from "@/lib/commerce";
import { HttpResponseError, postJson } from "@/lib/client-request";
import { MerchantInventory } from "./inventory";
import { ReturnReceipt } from "./return-receipt";
import { useOrderCommands } from "./use-order-commands";
type MerchantOrder = {
  id: string;
  store_id: string;
  version: number;
  operational_status: OrderState;
  items: CommerceLine[];
  acceptance_deadline: string | null;
  preparation_allowed: boolean;
  return_received_allowed?: boolean;
  eta?: string | null;
  tracking_url?: string | null;
};
type StoreView = { id: string; name: string; paused: boolean };
type Board = { orders: MerchantOrder[]; stores: StoreView[] };
const actionLabels: Record<MerchantCommand["command"], string> = {
  accept: "Aceitar pedido",
  reject: "Rejeitar pedido",
  unavailable: "Artigo indisponível",
  ready: "Marcar pronto para recolha",
  correct_ready: "Corrigir preparação",
  return_received: "Confirmar receção da devolução",
  pause: "Pausar loja",
  resume: "Retomar loja",
};
export function OrderDashboard() {
  const [orders, setOrders] = useState<MerchantOrder[]>([]),
    [stores, setStores] = useState<StoreView[]>([]),
    [error, setError] = useState(""),
    [now, setNow] = useState(0),
    [sound, setSound] = useState(false),
    [sessionAvailable, setSessionAvailable] = useState(false);
  const audio = useRef<AudioContext | null>(null),
    seen = useRef(new Set<string>()),
    accessDenied = useRef(false),
    mounted = useRef(false),
    readSequence = useRef(0),
    appliedRead = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const clearSession = useCallback(() => {
    accessDenied.current = true;
    setSessionAvailable(false);
    setOrders([]);
    setStores([]);
    seen.current.clear();
    setError("A sessão terminou ou perdeu acesso. Inicia sessão novamente.");
  }, []);
  const readOrders = useCallback(async (): Promise<Board | null> => {
    if (accessDenied.current)
      throw new HttpResponseError("Inicia sessão novamente.", 401);
    const sequence = ++readSequence.current;
    const response = await fetch("/api/merchant/orders", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!mounted.current) return null;
    if (response.status === 401 || response.status === 403) {
      clearSession();
      throw new HttpResponseError("Inicia sessão novamente.", response.status);
    }
    if (!response.ok) throw new Error("Não foi possível atualizar os pedidos.");
    const data: Board = await response.json();
    if (!mounted.current) return null;
    if (accessDenied.current)
      throw new HttpResponseError("Inicia sessão novamente.", 401);
    if (sequence < appliedRead.current) return null;
    appliedRead.current = sequence;
    setSessionAvailable(true);
    setOrders(data.orders);
    setStores(data.stores);
    setError("");
    return data;
  }, [clearSession]);
  const refreshOrders = useCallback(async () => {
    await readOrders();
  }, [readOrders]);
  const commands = useOrderCommands({
    enabled: sessionAvailable,
    refresh: refreshOrders,
    onAccessDenied: clearSession,
  });
  useEffect(() => {
    let stopped = false;
    let polling = false;
    async function poll() {
      if (
        stopped ||
        accessDenied.current ||
        polling ||
        document.visibilityState !== "visible"
      )
        return;
      polling = true;
      try {
        const data = await readOrders();
        if (stopped || accessDenied.current || !data) return;
        for (const o of data.orders) {
          if (
            o.operational_status === "awaiting_merchant" &&
            !seen.current.has(o.id)
          ) {
            seen.current.add(o.id);
            if (sound && audio.current) {
              const osc = audio.current.createOscillator();
              osc.connect(audio.current.destination);
              osc.start();
              osc.stop(audio.current.currentTime + 0.2);
            }
          }
        }
      } catch (e) {
        if (!stopped && !accessDenied.current)
          setError(
            e instanceof Error ? e.message : "Não foi possível atualizar.",
          );
      } finally {
        polling = false;
      }
    }
    void poll();
    const timer = setInterval(poll, 5000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [sound, readOrders]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const storeIds = stores.map((s) => s.id).join(",");
  useEffect(() => {
    let stopped = false;
    async function beat() {
      if (
        stopped ||
        accessDenied.current ||
        document.visibilityState !== "visible"
      )
        return;
      for (const id of storeIds.split(",").filter(Boolean)) {
        if (stopped || accessDenied.current) return;
        try {
          await postJson("/api/merchant/heartbeat", { store_id: id });
        } catch (error) {
          if (
            !stopped &&
            error instanceof HttpResponseError &&
            (error.status === 401 || error.status === 403)
          ) {
            clearSession();
            return;
          }
          if (!stopped && !accessDenied.current)
            setError("A ligação à loja falhou. Novos pedidos ficam em pausa.");
        }
      }
    }
    void beat();
    const timer = setInterval(beat, 30000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [storeIds, clearSession]);
  function command(o: MerchantOrder, action: MerchantCommand["command"]) {
    if (accessDenied.current || commands.isPending(o.id)) return;
    const seal =
      action === "ready"
        ? window.prompt(
            "Confirma todos os artigos e indica a referência do selo.",
          )
        : action === "unavailable"
          ? window.prompt(
              "Indica o código do artigo indisponível apresentado no pedido. O pedido completo será cancelado.",
            )
          : undefined;
    if (["ready", "unavailable"].includes(action) && !seal) return;
    commands.start(o.id, {
      expected_version: o.version,
      command: action,
      ...(seal ? { seal } : {}),
      ...(["reject", "unavailable"].includes(action)
        ? {
            reason:
              action === "unavailable"
                ? "ITEM_UNAVAILABLE"
                : "MERCHANT_REJECTED",
          }
        : {}),
    });
  }
  return (
    <main id="main" className="container commerce-page">
      <h1>Pedidos da loja</h1>
      <p>
        Aceitar confirma o stock. Prepara apenas quando o pedido disser «Podes
        preparar».
      </p>
      <button
        className="button button-secondary"
        onClick={async () => {
          audio.current ??= new AudioContext();
          await audio.current.resume();
          setSound(true);
        }}
      >
        {sound ? "Som ativado" : "Ativar som"}
      </button>
      <a href="/merchant/login">Iniciar sessão</a>
      <p role="alert">{error}</p>
      <p role="status">{commands.message}</p>
      {sessionAvailable &&
        [...commands.attempts.values()].map((attempt) => (
          <section
            className="commerce-card"
            key={attempt.orderId}
            aria-label={`Ação do pedido ${attempt.orderId.slice(0, 8)}`}
          >
            <h2>
              {actionLabels[attempt.input.command]} ·{" "}
              {attempt.orderId.slice(0, 8)}
            </h2>
            <p>
              {attempt.phase === "confirmed"
                ? "A ação já foi registada. Falta atualizar o pedido."
                : attempt.phase === "rejected"
                  ? "A ação foi recusada. Atualiza o pedido antes de escolher outra."
                  : attempt.busy
                    ? "A confirmar a ação…"
                    : "A resposta não chegou. Repete a mesma ação para recuperar a confirmação."}
            </p>
            <p role="alert">{attempt.error}</p>
            <button
              className="button button-secondary"
              disabled={attempt.busy}
              onClick={() => commands.recover(attempt.orderId)}
            >
              {attempt.phase === "pending"
                ? "Repetir a mesma ação"
                : "Atualizar pedido"}
            </button>
          </section>
        ))}
      {stores.map((s) => (
        <div key={s.id}>
          <strong>{s.name}</strong>{" "}
          <button
            className="button button-quiet"
            onClick={async () => {
              if (accessDenied.current) return;
              try {
                await postJson("/api/merchant/heartbeat", {
                  store_id: s.id,
                  paused: !s.paused,
                });
                if (!accessDenied.current)
                  setStores((current) =>
                    current.map((v) =>
                      v.id === s.id ? { ...v, paused: !v.paused } : v,
                    ),
                  );
              } catch (error) {
                if (
                  error instanceof HttpResponseError &&
                  (error.status === 401 || error.status === 403)
                ) {
                  clearSession();
                  return;
                }
                if (!accessDenied.current)
                  setError("Não foi possível alterar a disponibilidade.");
              }
            }}
          >
            {s.paused ? "Retomar novos pedidos" : "Pausar novos pedidos"}
          </button>
        </div>
      ))}
      <div className="commerce-grid">
        {orders.map((o) => (
          <article className="commerce-card" key={o.id}>
            <h2>Pedido {o.id.slice(0, 8)}</h2>
            <p>
              {o.operational_status === "awaiting_merchant"
                ? `Responder em ${Math.max(0, Math.ceil((Date.parse(o.acceptance_deadline!) - now) / 1000))} s`
                : o.preparation_allowed
                  ? "Podes preparar"
                  : "A aguardar confirmação"}
            </p>
            <ul>
              {o.items.map((i) => (
                <li key={i.id}>
                  {i.quantity} × {i.name}
                  <ul>
                    {i.recipe.map((p) => (
                      <li key={p.sku}>
                        {p.quantity * i.quantity} × {p.sku}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            {o.eta && (
              <p>
                Entrega prevista:{" "}
                {new Date(o.eta).toLocaleTimeString("pt-PT", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
            {o.tracking_url && (
              <a
                href={o.tracking_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Acompanhar entrega
              </a>
            )}
            {o.return_received_allowed && (
              <ReturnReceipt
                version={o.version}
                items={o.items}
                disabled={commands.attempts.has(o.id)}
                onSubmit={(intent) => commands.start(o.id, intent)}
              />
            )}
            {o.operational_status === "awaiting_merchant" ? (
              <div className="commerce-actions">
                {(
                  [
                    ["accept", "Aceitar pedido"],
                    ["reject", "Rejeitar"],
                    ["unavailable", "Artigo indisponível"],
                  ] as const
                ).map(([a, label]) => (
                  <button
                    key={a}
                    className="button button-secondary"
                    disabled={commands.attempts.has(o.id)}
                    onClick={() => command(o, a)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : o.operational_status === "preparing" &&
              o.preparation_allowed ? (
              <button
                className="button button-primary"
                disabled={commands.attempts.has(o.id)}
                onClick={() => command(o, "ready")}
              >
                Selado e pronto para recolha
              </button>
            ) : (
              <p>{o.operational_status}</p>
            )}
          </article>
        ))}
      </div>
      {sessionAvailable && !orders.length && <p>A aguardar pedidos.</p>}
      {sessionAvailable && <MerchantInventory onAccessDenied={clearSession} />}
    </main>
  );
}
