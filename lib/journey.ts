import type { CartItem, Location } from "@/types";

const memory = new Map<string, string>();

/** Draft contact details live only for this tab, never in localStorage. */
export function readJourney<T>(key: string, fallback: T): T {
  try {
    const value = memory.get(key) ?? sessionStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    const value = memory.get(key);
    return value ? (JSON.parse(value) as T) : fallback;
  }
}

export function writeJourney(key: string, value: unknown) {
  const serialized = JSON.stringify(value);
  memory.set(key, serialized);
  try {
    sessionStorage.setItem(key, serialized);
  } catch {
    // Keep the form usable when browser storage is unavailable.
  }
}

export function checkoutKey(
  items: CartItem[],
  interest: boolean,
  chosenCity = "",
) {
  return interest
    ? `interest:${chosenCity.trim().toLocaleLowerCase("pt")}`
    : `basket:${items
        .map(
          ({ id, quantity, options }) =>
            `${id}:${quantity}:${JSON.stringify(Object.entries(options ?? {}).sort(([a], [b]) => a.localeCompare(b)))}`,
        )
        .sort()
        .join(",")}`;
}

export function locationKey(location: Location | null) {
  return location ? location.city.trim().toLocaleLowerCase("pt") : "";
}
