import { packById } from "./products";
import type { CartItem, Pack, PackOptions } from "@/types";

export const optionLabels = { beer: "Cerveja", mixer: "Mixer" };
export const optionChoices = {
  beer: [
    { value: "super-bock", label: "Super Bock" },
    { value: "sagres", label: "Sagres" },
  ],
  mixer: [
    { value: "coca-cola", label: "Original" },
    { value: "coca-cola-zero", label: "Zero" },
  ],
} as const;
export function packOptions(
  pack: Pack,
  supplied: PackOptions = {},
): PackOptions {
  return {
    ...(pack.options?.includes("beer")
      ? { beer: supplied.beer ?? "super-bock" }
      : {}),
    ...(pack.options?.includes("mixer")
      ? { mixer: supplied.mixer ?? "coca-cola" }
      : {}),
  };
}
export function packContents(pack: Pack, options: PackOptions = {}) {
  return pack.contents.map((line) =>
    line
      .replace(
        "Super Bock 33 cl",
        options.beer === "sagres" ? "Sagres 33 cl" : "Super Bock 33 cl",
      )
      .replace(
        "Coca-Cola Original",
        options.mixer === "coca-cola-zero"
          ? "Coca-Cola Zero"
          : "Coca-Cola Original",
      ),
  );
}
export function packEvent(id: string, options?: PackOptions) {
  const pack = packById.get(id);
  return pack
    ? {
        product_type: "pack" as const,
        pack_id: pack.id,
        pack_name: pack.name,
        pack_price: pack.price / 100,
        people_min: pack.peopleMin,
        people_max: pack.peopleMax,
        selected_options: packOptions(pack, options),
      }
    : { product_type: "individual" as const };
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
