import type { PackComponent, PackExtra } from "@/types";

// Brand prices are relative to each pack's default; extras use their full values.
export const beerCore = (quantity: number): PackComponent => ({
  key: "beer",
  label: `${quantity} minis · 20 cl`,
  choices: [
    {
      value: "super-bock",
      label: "Super Bock",
      content: `${quantity} × Super Bock Mini 20 cl`,
      price: 0,
    },
    {
      value: "sagres",
      label: "Sagres",
      content: `${quantity} × Sagres Mini 20 cl`,
      price: 0,
    },
  ],
});
export const vodkaCore: PackComponent = {
  key: "vodka",
  label: "1 vodka · 70 cl",
  choices: [
    {
      value: "absolut",
      label: "Absolut",
      content: "1 × Absolut Vodka 70 cl",
      price: 0,
    },
    {
      value: "eristoff",
      label: "Eristoff",
      content: "1 × Eristoff Vodka 70 cl",
      price: -580,
    },
    {
      value: "smirnoff",
      label: "Smirnoff",
      content: "1 × Smirnoff Vodka 70 cl",
      price: -570,
    },
  ],
};
export const fixedCore = (content: string): PackComponent => ({
  label: content,
  choices: [{ value: "included", label: content, content, price: 0 }],
});
export const mixerExtra = (
  quantity: number,
  key: "mixer" | "mixer2" = "mixer",
  label = `${quantity} refrigerante${quantity === 1 ? "" : "s"} · 1,75 L`,
): PackExtra => ({
  key,
  label,
  choices: [
    {
      value: "coca-cola",
      label: "Coca-Cola",
      content: `${quantity} × Coca-Cola Original 1,75 L`,
      price: quantity * 239,
    },
    {
      value: "coca-cola-zero",
      label: "Zero",
      content: `${quantity} × Coca-Cola Zero 1,75 L`,
      price: quantity * 199,
    },
    {
      value: "seven-up",
      label: "7Up",
      content: `${quantity} × 7Up 1,75 L`,
      price: quantity * 209,
    },
  ],
});
export const snackExtra = (
  defaultSnack: "doritos" | "pringles" = "doritos",
  key: "snack" | "snack2" = "snack",
): PackExtra => ({
  key,
  label: key === "snack2" ? "2.º snack" : "1 snack",
  choices: (defaultSnack === "pringles"
    ? ["pringles", "doritos"]
    : ["doritos", "pringles"]
  ).map((value) => ({
    value,
    label: value === "doritos" ? "Doritos" : "Pringles",
    content: `1 × ${value === "doritos" ? "Doritos 225 g" : "Pringles 175 g"}`,
    price: value === "doritos" ? 329 : 299,
  })),
});
const simpleExtra = (
  key: PackExtra["key"],
  label: string,
  content: string,
  price: number,
): PackExtra => ({
  key,
  label,
  choices: [{ value: "included", label: "Manter", content, price }],
});
export const iceExtra = (quantity: number) =>
  simpleExtra(
    "ice",
    `${quantity} saco${quantity === 1 ? "" : "s"} de gelo · 2 kg`,
    `${quantity} × gelo 2 kg`,
    quantity * 99,
  );
export const waterExtra = (quantity: number) =>
  simpleExtra(
    "water",
    `${quantity} águas · 50 cl`,
    `${quantity} × água Luso 50 cl`,
    quantity * 32,
  );
export const cupsExtra = (quantity: number) =>
  simpleExtra(
    "cups",
    `${quantity} copos`,
    `${quantity} × copos de papel`,
    quantity * 10,
  );
export const peanutsExtra = simpleExtra(
  "peanuts",
  "Amendoins · 200 g",
  "1 × amendoins torrados 200 g",
  100,
);
export const limesExtra = simpleExtra(
  "limes",
  "4 limas",
  "4 × limas frescas",
  108,
);
