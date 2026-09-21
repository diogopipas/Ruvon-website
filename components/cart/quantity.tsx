"use client";
import { Minus, Plus } from "lucide-react";
import { useCart } from "@/components/providers";
export function Quantity({
  id,
  name,
  compact = false,
}: {
  id: string;
  name: string;
  compact?: boolean;
}) {
  const { items, add, remove, ready } = useCart();
  const quantity = items.find((i) => i.id === id)?.quantity ?? 0;
  return quantity ? (
    <div className={`quantity ${compact ? "quantity-compact" : ""}`}>
      <button
        aria-label={`Retirar ${name}`}
        title={`Retirar ${name}`}
        onClick={() => remove(id)}
      >
        <Minus size={15} />
      </button>
      <span aria-live="polite">{quantity}</span>
      <button
        aria-label={`Adicionar ${name}`}
        onClick={() => add(id)}
        disabled={quantity >= 30}
      >
        <Plus size={15} />
      </button>
    </div>
  ) : (
    <button
      disabled={!ready}
      className="add-button"
      aria-label={`Adicionar ${name}`}
      onClick={() => add(id)}
    >
      <Plus size={22} />
    </button>
  );
}
