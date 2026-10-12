"use client";
import { useEffect, useRef, useState } from "react";
import type { CommerceLine, OrderState } from "@/lib/commerce";
import { postJson } from "@/lib/client-request";
import { MerchantInventory } from "./inventory";
import { ReturnReceipt } from "./return-receipt";
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
export function OrderDashboard() {
  const [orders, setOrders] = useState<MerchantOrder[]>([]),
    [stores, setStores] = useState<StoreView[]>([]),
    [error, setError] = useState(""),
    [now, setNow] = useState(0),
    [sound, setSound] = useState(false),
    [busy, setBusy] = useState("");
  const audio = useRef<AudioContext | null>(null),
    seen = useRef(new Set<string>());
  useEffect(() => {
    let stopped = false;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/merchant/orders", { cache: "no-store" });
        if (!r.ok) throw new Error("Sessão indisponível. Entra novamente.");
        const data = await r.json();
        if (stopped) return;
        setOrders(data.orders);
        setStores(data.stores);
        setError("");
        for (const o of data.orders as MerchantOrder[]) {
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
        if (!stopped)
          setError(
            e instanceof Error ? e.message : "Não foi possível atualizar.",
          );
      }
    }
    void poll();
    const timer = setInterval(poll, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [sound]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const storeIds = stores.map((s) => s.id).join(",");
  useEffect(() => {
    async function beat() {
      if (document.visibilityState !== "visible") return;
      for (const id of storeIds.split(",").filter(Boolean))
        try {
          await postJson("/api/merchant/heartbeat", { store_id: id });
        } catch {
          setError("A ligação à loja falhou. Novos pedidos ficam em pausa.");
        }
    }
    void beat();
    const timer = setInterval(beat, 30000);
    return () => clearInterval(timer);
  }, [storeIds]);
  async function command(o: MerchantOrder, action: string) {
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
    setBusy(o.id);
    try {
      await postJson(`/api/merchant/orders/${o.id}/commands`, {
        command_id: crypto.randomUUID(),
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
      const r = await fetch("/api/merchant/orders", { cache: "no-store" });
      if (r.ok) setOrders((await r.json()).orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Atualiza o pedido.");
    } finally {
      setBusy("");
    }
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
      {stores.map((s) => (
        <div key={s.id}>
          <strong>{s.name}</strong>{" "}
          <button
            className="button button-quiet"
            onClick={async () => {
              try {
                await postJson("/api/merchant/heartbeat", {
                  store_id: s.id,
                  paused: !s.paused,
                });
                setStores(
                  stores.map((v) =>
                    v.id === s.id ? { ...v, paused: !v.paused } : v,
                  ),
                );
              } catch {
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
              <ReturnReceipt id={o.id} version={o.version} items={o.items} />
            )}
            {o.operational_status === "awaiting_merchant" ? (
              <div className="commerce-actions">
                {[
                  ["accept", "Aceitar pedido"],
                  ["reject", "Rejeitar"],
                  ["unavailable", "Artigo indisponível"],
                ].map(([a, label]) => (
                  <button
                    key={a}
                    className="button button-secondary"
                    disabled={busy === o.id}
                    onClick={() => command(o, a)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : o.operational_status === "preparing" ? (
              <button
                className="button button-primary"
                disabled={busy === o.id}
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
      {!orders.length && <p>A aguardar pedidos.</p>}
      <MerchantInventory />
    </main>
  );
}
