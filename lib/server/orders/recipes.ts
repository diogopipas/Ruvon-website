import { packById, productById } from "@/lib/products";
import { packOptions } from "@/lib/packs";
import type { CartItem } from "@/types";
import type { Recipe } from "@/lib/commerce";
import { storeSkuFromId } from "@/lib/commerce";

// Stock units are explicit. Multipacks share the underlying physical SKU.
const individual: Record<string, Recipe> = {
  "super-bock": [{ sku: "super-bock-33", quantity: 6 }],
  "super-bock-mini-6": [{ sku: "super-bock-mini-20", quantity: 6 }],
  "super-bock-mini-12": [{ sku: "super-bock-mini-20", quantity: 12 }],
  "super-bock-mini-24": [{ sku: "super-bock-mini-20", quantity: 24 }],
  sagres: [{ sku: "sagres-33", quantity: 6 }],
  somersby: [{ sku: "somersby-33", quantity: 4 }],
  "somersby-8": [{ sku: "somersby-33", quantity: 8 }],
  "somersby-16": [{ sku: "somersby-33", quantity: 16 }],
  heineken: [{ sku: "heineken-25", quantity: 6 }],
  corona: [{ sku: "corona-355", quantity: 4 }],
  "super-bock-zero": [{ sku: "super-bock-zero-33", quantity: 6 }],
  "super-bock-zero-12": [{ sku: "super-bock-zero-33", quantity: 12 }],
  "red-bull": [{ sku: "red-bull-25", quantity: 4 }],
  "red-bull-single": [{ sku: "red-bull-25", quantity: 1 }],
  "agua-6": [{ sku: "agua-50", quantity: 6 }],
  copos: [{ sku: "copo", quantity: 20 }],
  "copos-10": [{ sku: "copo", quantity: 10 }],
  limas: [{ sku: "lima", quantity: 4 }],
  vodka: [{ sku: "absolut", quantity: 1 }],
  gin: [{ sku: "gordons", quantity: 1 }],
};
// Fixed contents and quantities never come from display strings.
const cores: Record<string, Recipe> = {
  "pack-mais-uma": [],
  "pack-classica": [],
  "pack-pre": [{ sku: "red-bull-25", quantity: 4 }],
  "pack-somersby": [{ sku: "somersby-33", quantity: 16 }],
  "pack-gin": [{ sku: "tonic", quantity: 3 }],
  "pack-sem-ressacas": [{ sku: "red-bull-25", quantity: 4 }],
};
export function resolveRecipe(item: CartItem): Recipe {
  const sku = storeSkuFromId(item.id);
  if (sku) {
    if (item.options && Object.keys(item.options).length)
      throw new Error("Opção indisponível para este artigo.");
    return [{ sku, quantity: 1 }];
  }
  const pack = packById.get(item.id);
  if (!pack) {
    if (!productById.has(item.id)) throw new Error("Artigo desconhecido.");
    return individual[item.id] ?? [{ sku: item.id, quantity: 1 }];
  }
  const options = packOptions(pack, item.options);
  const recipe = [...cores[pack.id]];
  if (options.beer)
    recipe.push({
      sku: `${options.beer}-mini-20`,
      quantity: pack.id === "pack-mais-uma" ? 12 : 24,
    });
  if (options.vodka) recipe.push({ sku: options.vodka, quantity: 1 });
  if (options.gin) recipe.push({ sku: options.gin, quantity: 1 });
  if (options.alcoholFreeBeer)
    recipe.push({ sku: `${options.alcoholFreeBeer}-33`, quantity: 12 });
  for (const key of ["mixer", "mixer2", "snack", "snack2"] as const) {
    const value = options[key];
    if (value && value !== "none")
      recipe.push({
        sku: value,
        quantity: key === "mixer" && pack.id === "pack-sem-ressacas" ? 2 : 1,
      });
  }
  for (const [key, sku, quantity] of [
    ["ice", "gelo", 1],
    ["water", "agua-50", 6],
    ["cups", "copo", pack.id === "pack-mais-uma" ? 10 : 20],
    ["limes", "lima", 4],
    ["peanuts", "amendoins", 1],
  ] as const) {
    if (options[key] === "included") recipe.push({ sku, quantity });
  }
  return aggregateRecipe(recipe);
}
export function aggregateRecipe(recipe: Recipe): Recipe {
  const counts = new Map<string, number>();
  for (const part of recipe)
    counts.set(part.sku, (counts.get(part.sku) ?? 0) + part.quantity);
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sku, quantity]) => ({ sku, quantity }));
}
