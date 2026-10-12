"use client";
import { useState } from "react";
import type { CommerceLine } from "@/lib/commerce";
import { postJson } from "@/lib/client-request";
export function ReturnReceipt({
  id,
  version,
  items,
}: {
  id: string;
  version: number;
  items: CommerceLine[];
}) {
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const quantities = new Map<string, number>();
  for (const item of items)
    for (const p of item.recipe)
      quantities.set(
        p.sku,
        (quantities.get(p.sku) ?? 0) + p.quantity * item.quantity,
      );
  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await postJson(`/api/merchant/orders/${id}/commands`, {
        command_id: crypto.randomUUID(),
        expected_version: version,
        command: "return_received",
        reason: String(data.get("condition")),
        saleable: Object.fromEntries(
          [...quantities.keys()].map((sku) => [sku, Number(data.get(sku))]),
        ),
      });
      setDone(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível guardar a receção.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <p role="status">
        Receção guardada. A resolução financeira fica em análise.
      </p>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(e.currentTarget);
      }}
    >
      <h3>Confirmar receção da devolução</h3>
      <p>
        Conta apenas unidades recebidas em condição de venda. Artigos
        danificados ou não recebidos ficam a zero.
      </p>
      {[...quantities].map(([sku, quantity]) => (
        <label key={sku}>
          {sku} · máximo {quantity}
          <input
            type="number"
            name={sku}
            min="0"
            max={quantity}
            step="1"
            defaultValue="0"
            required
            disabled={busy}
          />
        </label>
      ))}
      <label>
        Condição da devolução
        <textarea
          name="condition"
          required
          minLength={3}
          maxLength={400}
          disabled={busy}
        />
      </label>
      <p role="alert">{error}</p>
      <button className="button button-secondary" disabled={busy}>
        Guardar receção e condição
      </button>
    </form>
  );
}
