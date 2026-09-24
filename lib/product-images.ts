/** Locally hosted illustrative preview packshots. Replace per SKU with approved photography. */
export const productImages: Record<string, string> = Object.fromEntries(
  [
    "super-bock",
    "sagres",
    "somersby",
    "super-bock-zero",
    "coca-cola",
    "coca-cola-zero",
    "red-bull",
    "tonic",
    "gin",
    "vodka",
    "doritos",
    "pringles",
    "agua",
    "amendoins",
    "gelo",
    "copos",
    "seven-up",
  ].map((id) => [id, `/images/products/${id}.webp`]),
);
