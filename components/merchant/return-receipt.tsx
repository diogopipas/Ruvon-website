"use client";
import type { CommerceLine } from "@/lib/commerce";
import type { MerchantIntent } from "./use-order-commands";
export function ReturnReceipt({
  version,
  items,
  disabled,
  onSubmit,
}: {
  version: number;
  items: CommerceLine[];
  disabled: boolean;
  onSubmit: (intent: MerchantIntent) => void;
}) {
  const quantities = new Map<string, number>();
  for (const item of items)
    for (const p of item.recipe)
      quantities.set(
        p.sku,
        (quantities.get(p.sku) ?? 0) + p.quantity * item.quantity,
      );
  function submit(form: HTMLFormElement) {
    if (disabled) return;
    const data = new FormData(form);
    onSubmit({
      expected_version: version,
      command: "return_received",
      reason: String(data.get("condition")),
      saleable: Object.fromEntries(
        [...quantities.keys()].map((sku) => [sku, Number(data.get(sku))]),
      ),
    });
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
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
            disabled={disabled}
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
          disabled={disabled}
        />
      </label>
      <button className="button button-secondary" disabled={disabled}>
        Guardar receção e condição
      </button>
    </form>
  );
}
