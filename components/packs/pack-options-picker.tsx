"use client";
import { componentChoices, configurePack, packChangeEvent } from "@/lib/packs";
import { money } from "@/lib/pricing";
import { track } from "@/lib/analytics";
import type { Pack, PackComponent, PackOptions } from "@/types";

export function PackOptionsPicker({
  pack,
  value,
  onChange,
  disabled = false,
  source = "detail",
}: {
  pack: Pack;
  value: PackOptions;
  onChange: (value: PackOptions) => void;
  disabled?: boolean;
  source?: "detail" | "cart";
}) {
  const selection = configurePack(pack, value);
  function partControl(part: PackComponent, removable: boolean) {
    if (!part.key)
      return (
        <p className="pack-fixed-item" key={part.label}>
          {part.choices[0].content}
        </p>
      );
    const key = part.key;
    const choices = componentChoices(part, removable);
    const current = choices.find(
      (choice) => choice.value === selection.options[key],
    )!;
    return (
      <fieldset className="pack-option" key={key} disabled={disabled}>
        <legend>{part.label}</legend>
        <div>
          {choices.map((choice) => {
            const selected = current.value === choice.value;
            const delta = choice.price - current.price;
            const label = choice.value === "none" ? "Sem" : choice.label;
            const priceLabel =
              delta === 0
                ? selected
                  ? ""
                  : "Mesmo preço"
                : `${delta > 0 ? "+" : "−"}${money(Math.abs(delta))}`;
            return (
              <button
                type="button"
                key={choice.value}
                aria-pressed={selected}
                aria-label={`${part.label}: ${label}${priceLabel ? ` (${priceLabel})` : ""}`}
                onClick={() => {
                  if (selected) return;
                  const next = { ...selection.options, [key]: choice.value };
                  track(
                    "pack_options_changed",
                    packChangeEvent(pack, selection.options, next, source),
                  );
                  onChange(next);
                }}
              >
                <span>{label}</span>
                {priceLabel && <small>{priceLabel}</small>}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }
  return (
    <div className="pack-customization">
      <h3>O que define o pack</h3>
      <p className="pack-option-note">As bebidas ficam. A marca é contigo.</p>
      <div className="pack-core-options">
        {pack.core.map((part) => partControl(part, false))}
      </div>
      <div className="pack-extras-heading">
        <h3>Os extras da noite</h3>
        <p className="pack-option-note">
          Já vêm no pack. Troca ou retira; o preço acompanha.
        </p>
      </div>
      {pack.extras.map((part) => partControl(part, true))}
      <p className="pack-live-price" role="status" aria-live="polite">
        Total <strong>{money(selection.price)}</strong>
      </p>
    </div>
  );
}
