"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { OperationsControl, OperationsMonitor } from "@/lib/operations";
import { postJson } from "@/lib/client-request";

const date = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-PT") : "Sem registo";

function OrderLink({ id }: { id: string | null }) {
  return id ? (
    <Link href={`/admin/orders/${id}`}>Ver pedido {id.slice(0, 8)}</Link>
  ) : null;
}

async function readMonitor(): Promise<OperationsMonitor> {
  const response = await fetch("/api/admin/operations", {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Inicia sessão com uma conta de operações autorizada."
        : "Não foi possível atualizar a monitorização.",
    );
  return response.json();
}

export function OperationsHealth() {
  const [monitor, setMonitor] = useState<OperationsMonitor | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<OperationsControl | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    let refreshing = false;
    async function refresh() {
      if (refreshing || document.visibilityState !== "visible") return;
      refreshing = true;
      try {
        const result = await readMonitor();
        if (active) {
          setMonitor(result);
          setLoadError("");
        }
      } catch (error) {
        if (active) {
          setMonitor(null);
          setLoadError(error instanceof Error ? error.message : "Sem ligação.");
        }
      } finally {
        refreshing = false;
      }
    }
    void refresh();
    const timer = setInterval(refresh, 10000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  async function submit(input: OperationsControl) {
    if (busy) return;
    setPending(input);
    setBusy(true);
    setActionError("");
    setMessage("");
    try {
      await postJson("/api/admin/operations/commands", input);
      setPending(null);
      setReason("");
      setMessage("Ação registada. A atualizar o estado…");
      setMonitor(await readMonitor());
      setLoadError("");
      setMessage("Ação registada e estado atualizado.");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Sem confirmação.",
      );
    } finally {
      setBusy(false);
    }
  }

  function command(
    action: OperationsControl["action"],
    target_id: string,
    expected_version: number,
  ) {
    if (reason.trim().length < 3) {
      setActionError("Indica o motivo antes de escolher uma ação.");
      return;
    }
    void submit({
      command_id: crypto.randomUUID(),
      action,
      target_id,
      expected_version,
      reason: reason.trim(),
    });
  }

  return (
    <main id="main" className="container commerce-page operations-monitor">
      <h1>Operações · Saúde e falhas</h1>
      <nav className="commerce-actions" aria-label="Operações">
        <Link href="/admin/orders">Pedidos</Link>
        <Link href="/merchant/login">Entrar com conta pessoal</Link>
      </nav>
      <p role="alert">{loadError || actionError}</p>
      <p role="status">{message}</p>
      {pending && !busy && (
        <div className="commerce-card">
          <p>
            A tentativa continua identificada por{" "}
            {pending.command_id.slice(0, 8)}. Podes repetir a mesma ação para
            recuperar a confirmação.
          </p>
          <div className="commerce-actions">
            <button
              className="button button-secondary"
              onClick={() => void submit(pending)}
            >
              Repetir a mesma ação
            </button>
            <button
              className="button button-quiet"
              onClick={async () => {
                try {
                  setMonitor(await readMonitor());
                  setPending(null);
                  setActionError("");
                } catch (error) {
                  setLoadError(
                    error instanceof Error ? error.message : "Sem ligação.",
                  );
                }
              }}
            >
              Fechar tentativa e atualizar
            </button>
          </div>
        </div>
      )}
      {monitor && (
        <>
          <p>
            Ambiente: {monitor.configuration.environment} · Checkout:{" "}
            {monitor.configuration.checkout_exposed
              ? "exposição permitida"
              : "desativado"}
            <br />
            Atualizado: {date(monitor.checked_at)}
          </p>
          <div className="commerce-grid">
            <section className="commerce-card" aria-labelledby="worker-title">
              <h2 id="worker-title">Automação</h2>
              <p>
                {monitor.worker?.healthy
                  ? "Worker saudável"
                  : "Worker sem execução recente"}
              </p>
              <p>
                Última execução concluída:{" "}
                {date(monitor.worker?.last_success_at ?? null)}
              </p>
              <p>Jobs nessa execução: {monitor.worker?.jobs_processed ?? 0}</p>
              {monitor.worker?.last_error && <p>{monitor.worker.last_error}</p>}
            </section>
            <section className="commerce-card" aria-labelledby="provider-title">
              <h2 id="provider-title">Configuração dos prestadores</h2>
              {(
                [
                  ["easypay", "Easypay"],
                  ["uber", "Uber Direct"],
                  ["email", "Email"],
                ] as const
              ).map(([key, label]) => (
                <p key={key}>
                  {label}:{" "}
                  {monitor.configuration[key] ? "configurado" : "incompleto"}
                </p>
              ))}
              <p>As capacidades comerciais exigem evidência verificada.</p>
            </section>
          </div>
          <form onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="operations-reason">Motivo da próxima ação</label>
            <textarea
              id="operations-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={3}
              maxLength={400}
              disabled={busy || !!pending}
              aria-describedby="operations-reason-help"
            />
            <p id="operations-reason-help">
              Fica no histórico com a tua identidade. Usa uma justificação
              operacional sem contactos ou moradas.
            </p>
          </form>
          <section aria-labelledby="stores-title">
            <h2 id="stores-title">Lojas</h2>
            {!monitor.stores.length && <p>Ainda não há lojas configuradas.</p>}
            <div className="commerce-grid">
              {monitor.stores.map((store) => (
                <article className="commerce-card" key={store.id}>
                  <h3>{store.name}</h3>
                  <p>
                    {store.enabled ? "Ativada" : "Desativada"} ·{" "}
                    {store.paused ? "Em pausa" : "Sem pausa"} ·{" "}
                    {store.connected
                      ? "Painel ligado"
                      : "Painel sem sinal recente"}
                  </p>
                  {store.pause_reason && <p>{store.pause_reason}</p>}
                  <p>Último sinal: {date(store.heartbeat_at)}</p>
                  <button
                    className="button button-secondary"
                    disabled={
                      busy ||
                      !!pending ||
                      (store.paused && (!store.enabled || !store.connected))
                    }
                    onClick={() =>
                      command(
                        store.paused ? "resume_store" : "pause_store",
                        store.id,
                        store.operations_version,
                      )
                    }
                  >
                    {store.paused
                      ? "Retomar novos pedidos"
                      : "Pausar novos pedidos"}
                  </button>
                  <p>
                    A retoma continua sujeita aos horários, stock e capacidades
                    verificadas.
                  </p>
                </article>
              ))}
            </div>
          </section>
          <section aria-labelledby="jobs-title">
            <h2 id="jobs-title">Jobs falhados ou atrasados</h2>
            {!monitor.jobs.length && <p>Sem falhas ou atrasos a apresentar.</p>}
            {monitor.jobs.map((job) => (
              <article className="commerce-card" key={job.id}>
                <h3>
                  {job.kind} · {job.state}
                </h3>
                <p>
                  {job.id} · {job.attempts} tentativas
                </p>
                <p>
                  Agendado: {date(job.due_at)} · {job.last_error}
                </p>
                <OrderLink id={job.order_id} />
                {job.can_retry && (
                  <button
                    className="button button-secondary"
                    disabled={busy || !!pending}
                    onClick={() => command("retry_event", job.id, job.attempts)}
                  >
                    Repetir processamento do callback
                  </button>
                )}
              </article>
            ))}
            <p>
              As operações financeiras são reconciliadas na página do pedido.
              Leases expiradas são recuperadas pelo worker.
            </p>
          </section>
          <section aria-labelledby="events-title">
            <h2 id="events-title">Callbacks por analisar</h2>
            {!monitor.events.length && <p>Sem callbacks por analisar.</p>}
            {monitor.events.map((event) => (
              <article className="commerce-card" key={event.id}>
                <h3>
                  {event.provider} · {event.state}
                </h3>
                <p>{event.processing_error || "Aguarda processamento"}</p>
                <p>
                  Evento: {event.event_identity}
                  <br />
                  Recurso: {event.resource_id || "Sem referência"}
                </p>
                <p>Recebido: {date(event.received_at)}</p>
              </article>
            ))}
          </section>
          <section aria-labelledby="unknown-title">
            <h2 id="unknown-title">Resultados incertos dos prestadores</h2>
            {!monitor.operations.length && (
              <p>Sem resultados incertos a apresentar.</p>
            )}
            {monitor.operations.map((operation) => (
              <article className="commerce-card" key={operation.id}>
                <h3>
                  {operation.provider} · {operation.kind} · {operation.status}
                </h3>
                <p>
                  {operation.error_class} ·{" "}
                  {operation.provider_resource_id ||
                    "Sem referência confirmada"}
                </p>
                <OrderLink id={operation.order_id} />
              </article>
            ))}
          </section>
          <section aria-labelledby="notifications-title">
            <h2 id="notifications-title">Notificações com falhas ou atrasos</h2>
            {!monitor.notifications.length && (
              <p>Sem notificações com falhas ou atrasos.</p>
            )}
            {monitor.notifications.map((notification) => (
              <article className="commerce-card" key={notification.id}>
                <h3>
                  {notification.channel} · {notification.purpose} ·{" "}
                  {notification.status}
                </h3>
                <p>
                  {notification.attempts} tentativas · {notification.last_error}
                </p>
                <OrderLink id={notification.order_id} />
              </article>
            ))}
          </section>
          <section aria-labelledby="capabilities-title">
            <h2 id="capabilities-title">Evidência de capacidades</h2>
            {!monitor.capabilities.length && (
              <p>Ainda não há capacidades verificadas.</p>
            )}
            {monitor.capabilities.map((capability) => (
              <p key={capability.capability}>
                {capability.capability} ·{" "}
                {capability.verified ? "verificada" : "expirada"} ·{" "}
                {date(capability.expires_at)}
              </p>
            ))}
          </section>
          <section aria-labelledby="audit-title">
            <h2 id="audit-title">Histórico dos controlos</h2>
            {!monitor.audit.length && <p>Sem ações registadas.</p>}
            <ol>
              {monitor.audit.map((entry) => (
                <li key={entry.command_id}>
                  {date(entry.created_at)} · {entry.action} · {entry.reason}
                  <br />
                  Conta: {entry.actor_id} · Alvo: {entry.target_id}
                </li>
              ))}
            </ol>
          </section>
          <p>
            As listas de falhas apresentam até 100 registos, começando pelos
            mais antigos. O histórico apresenta as 30 ações mais recentes.
          </p>
        </>
      )}
    </main>
  );
}
