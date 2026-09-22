"use client";
import { Minus, Plus } from "lucide-react";
import { useCart } from "@/components/providers";
export function Quantity({
  id,
  name,
  compact = false,
  disabled = false,
}: {
  id: string;
  name: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const { items, add, remove, ageConfirmed } = useCart();
  const quantity = items.find((i) => i.id === id)?.quantity ?? 0;
  return quantity ? (
    <div className={`quantity ${compact ? "quantity-compact" : ""}`}>
      <button
        aria-label={`Retirar ${name}`}
        title={`Retirar ${name}`}
        onClick={() => remove(id)}
        disabled={disabled || !ageConfirmed}
      >
        <Minus size={15} />
      </button>
      <span aria-live="polite" aria-label={`${quantity} no carrinho`}>
        {quantity}
      </span>
      <button
        aria-label={`Adicionar ${name}`}
        onClick={() => add(id)}
        disabled={disabled || !ageConfirmed || quantity >= 30}
      >
        <Plus size={15} />
      </button>
    </div>
  ) : (
    <button
      disabled={disabled || !ageConfirmed}
      className="add-button"
      aria-label={`Adicionar ${name}`}
      onClick={() => add(id)}
    >
      <Plus size={22} />
    </button>
  );
}
