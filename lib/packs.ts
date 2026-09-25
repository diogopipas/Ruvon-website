import { packById } from "./products";
import type {
  CartItem,
  Pack,
  PackComponent,
  PackOptionKey,
  PackOptions,
} from "@/types";

export function componentChoices(component: PackComponent, removable = false) {
  return removable
    ? [
        ...component.choices,
        { value: "none", label: "Sem", content: "", price: 0 },
      ]
    : component.choices;
}
/** Canonicalize selections; never accept client prices or core removal. */
export function packOptions(
  pack: Pack,
  supplied: PackOptions = {},
): PackOptions {
  const components = [...pack.core, ...pack.extras].filter((part) => part.key);
  if (
    Object.keys(supplied).some(
      (key) => !components.some((part) => part.key === key),
    )
  )
    throw new Error("Opção indisponível para este pack.");
  return Object.fromEntries(
    components.map((part) => {
      const key = part.key!;
      const value = supplied[key] ?? part.choices[0].value;
      const removable = pack.extras.some((extra) => extra.key === key);
      if (
        !componentChoices(part, removable).some(
          (choice) => choice.value === value,
        )
      )
        throw new Error("Escolha indisponível para este pack.");
      return [key, value];
    }),
  );
}
export function configurePack(pack: Pack, supplied: PackOptions = {}) {
  const options = packOptions(pack, supplied);
  const resolve = (part: PackComponent, extra: boolean) =>
    componentChoices(part, extra).find(
      (choice) =>
        choice.value === (part.key ? options[part.key] : part.choices[0].value),
    )!;
  const core = pack.core.map((part) => resolve(part, false));
  const extras = pack.extras.map((part) => resolve(part, true));
  const adjustment =
    [...core, ...extras].reduce((sum, choice) => sum + choice.price, 0) -
    [...pack.core, ...pack.extras].reduce(
      (sum, part) => sum + part.choices[0].price,
      0,
    );
  return {
    options,
    price: pack.price + adjustment,
    core: core.map((choice) => choice.content),
    extras: extras
      .filter((choice) => choice.value !== "none")
      .map((choice) => choice.content),
    removed: pack.extras
      .filter((part) => options[part.key] === "none")
      .map((part) => part.key),
  };
}
export function packContents(pack: Pack, options: PackOptions = {}) {
  const selection = configurePack(pack, options);
  return [...selection.core, ...selection.extras];
}
export function packEvent(id: string, options?: PackOptions) {
  const pack = packById.get(id);
  if (!pack) return { product_type: "individual" as const };
  const selection = configurePack(pack, options);
  return {
    product_type: "pack" as const,
    pack_id: pack.id,
    pack_name: pack.name,
    pack_tier: pack.tier,
    pack_price: selection.price / 100,
    default_pack_price: pack.price / 100,
    people_min: pack.peopleMin,
    people_max: pack.peopleMax,
    selected_options: selection.options,
    removed_extras: selection.removed,
  };
}
/** One event per option action, including unsaved detail exploration. */
export function packChangeEvent(
  pack: Pack,
  before: PackOptions,
  after: PackOptions,
  source: "detail" | "cart",
) {
  const previous = configurePack(pack, before);
  const next = configurePack(pack, after);
  const changed = (Object.keys(next.options) as PackOptionKey[]).filter(
    (key) => next.options[key] !== previous.options[key],
  );
  return {
    product: pack.id,
    ...packEvent(pack.id, after),
    source,
    previous_options: previous.options,
    changed_options: changed,
    previous_pack_price: previous.price / 100,
    price_delta: (next.price - previous.price) / 100,
    changes: changed.map((key) => ({
      option: key,
      from: previous.options[key]!,
      to: next.options[key]!,
      action:
        next.options[key] === "none"
          ? ("removed" as const)
          : previous.options[key] === "none"
            ? ("restored" as const)
            : ("swapped" as const),
    })),
  };
}
export function basketPackEvents(items: CartItem[]) {
  return {
    contains_pack: items.some((item) => packById.has(item.id)),
    packs: items
      .filter((item) => packById.has(item.id))
      .map((item) => ({
        ...packEvent(item.id, item.options),
        quantity: item.quantity,
      })),
  };
}
export type GroupSize = "all" | "2-3" | "4-6" | "7+";
export function fitsGroup(pack: Pack, group: GroupSize) {
  return (
    group === "all" ||
    (group === "2-3"
      ? pack.peopleMin <= 3
      : group === "7+"
        ? pack.peopleMax >= 7
        : pack.peopleMin <= 6 && pack.peopleMax >= 4)
  );
}
