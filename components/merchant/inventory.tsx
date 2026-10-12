"use client";
import { useEffect, useState } from "react";
import { postJson } from "@/lib/client-request";
type Product = {
  store_id: string;
  sku: string;
  name: string;
  unit: string;
  stock_on_hand: number;
  reserved_quantity: number;
  enabled: boolean;
  version: number;
};
export function MerchantInventory() {
  const [products, setProducts] = useState<Product[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  async function load() {
    const r = await fetch("/api/merchant/inventory", { cache: "no-store" });
    if (!r.ok) throw new Error("Não foi possível consultar o inventário.");
    return r.json() as Promise<Product[]>;
  }
  useEffect(() => {
    let active = true;
    load()
      .then((p) => {
        if (active) setProducts(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(product: Product, form: HTMLFormElement) {
    setBusy(product.sku);
    setError("");
    const data = new FormData(form);
    try {
      await postJson("/api/merchant/inventory", {
        store_id: product.store_id,
        sku: product.sku,
        quantity: Number(data.get("quantity")),
        enabled: data.get("enabled") === "on",
        expected_version: product.version,
      });
      setProducts(await load());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Atualiza antes de guardar.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section>
      <h2>Inventário da loja</h2>
      <p>
        O total inclui unidades reservadas. Não retires stock já reservado para
        pedidos.
      </p>
      <p role="alert">{error}</p>
      <div className="commerce-grid">
        {products.map((p) => (
          <form
            className="commerce-card"
            key={`${p.store_id}:${p.sku}:${p.version}`}
            onSubmit={(e) => {
              e.preventDefault();
              void save(p, e.currentTarget);
            }}
          >
            <h3>
              {p.name} · {p.unit}
            </h3>
            <p>{p.reserved_quantity} reservadas</p>
            <label>
              Quantidade total
              <input
                name="quantity"
                type="number"
                min={p.reserved_quantity}
                step="1"
                defaultValue={p.stock_on_hand}
                required
                disabled={busy === p.sku}
              />
            </label>
            <label>
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={p.enabled}
              />{" "}
              Disponível para novos pedidos
            </label>
            <button
              className="button button-secondary"
              disabled={busy === p.sku}
            >
              Guardar disponibilidade
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
