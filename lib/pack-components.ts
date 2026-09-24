import type { PackComponent, PackExtra } from "@/types";

// MVP preview contributions, per complete component (not individual retail prices).
export const beerCore = (quantity: number): PackComponent => ({
  key: "beer", label: `${quantity} cervejas · 33 cl`,
  choices: [
    { value: "super-bock", label: "Super Bock", content: `${quantity} × Super Bock 33 cl`, price: 0 },
    { value: "sagres", label: "Sagres", content: `${quantity} × Sagres 33 cl`, price: 0 },
  ],
});
export const vodkaCore: PackComponent = {
  key: "vodka", label: "1 vodka · 70 cl",
  choices: [
    { value: "eristoff", label: "Eristoff", content: "1 × Eristoff Vodka 70 cl", price: 0 },
    { value: "smirnoff", label: "Smirnoff", content: "1 × Smirnoff Vodka 70 cl", price: 200 },
  ],
};
export const fixedCore = (content: string): PackComponent => ({
  label: content, choices: [{ value: "included", label: content, content, price: 0 }],
});
export const mixerExtra = (quantity: number): PackExtra => ({
  key: "mixer", label: `${quantity} refrigerante${quantity === 1 ? "" : "s"} · 1,5 L`,
  choices: [
    { value: "coca-cola", label: "Coca-Cola", content: `${quantity} × Coca-Cola Original 1,5 L`, price: quantity * 150 },
    { value: "coca-cola-zero", label: "Zero", content: `${quantity} × Coca-Cola Zero 1,5 L`, price: quantity * 150 },
    { value: "seven-up", label: "7Up", content: `${quantity} × 7Up 1,5 L`, price: quantity * 150 },
  ],
});
export const snackExtra = (quantity: number, pringles = false): PackExtra => ({
  key: "snack", label: `${quantity} snack${quantity === 1 ? "" : "s"}`,
  choices: (pringles ? ["pringles", "doritos"] : ["doritos", "pringles"]).map((value) => ({
    value, label: value === "doritos" ? "Doritos" : "Pringles",
    content: `${quantity} × ${value === "doritos" ? "Doritos Tex-Mex 140 g" : "Pringles Original 165 g"}`,
    price: quantity * (value === "doritos" ? 150 : 200),
  })),
});
const simpleExtra = (key: PackExtra["key"], label: string, content: string, price: number): PackExtra => ({
  key, label, choices: [{ value: "included", label: "Manter", content, price }],
});
export const iceExtra = (quantity: number) => simpleExtra("ice", `${quantity} saco${quantity === 1 ? "" : "s"} de gelo · 2 kg`, `${quantity} × gelo 2 kg`, quantity * 150);
export const waterExtra = (quantity: number) => simpleExtra("water", `${quantity} águas · 50 cl`, `${quantity} × água Luso 50 cl`, quantity * 50);
export const cupsExtra = (quantity: number) => simpleExtra("cups", `${quantity} copos`, `${quantity} × copos de papel`, quantity * 5);
export const peanutsExtra = simpleExtra("peanuts", "Amendoins · 200 g", "1 × amendoins torrados 200 g", 100);
export const limesExtra = simpleExtra("limes", "4 limas", "4 × limas frescas", 100);
