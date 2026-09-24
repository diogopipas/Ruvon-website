import type { Database } from "@/types";
import { packById, productById } from "./products";

/** Browser-profile demand signals, not unique people or paid orders. */
export function summarizePacks(db: Database) {
  const isPack = (id: string) => packById.has(id);
  const profiles = new Set([
    ...db.analytics_events.map((event) => event.session_id),
    ...db.simulated_orders.map((order) => order.session_id),
  ]);
  const views = new Set<string>();
  const additions = new Set<string>();
  const addons = new Map<string, number>();
  const groups = new Map<string, { at: string; value: string }>();
  for (const event of db.analytics_events) {
    const pack =
      event.properties.product_type === "pack" ||
      isPack(String(event.properties.product));
    if (pack && event.name === "product_viewed") views.add(event.session_id);
    if (pack && event.name === "product_added") additions.add(event.session_id);
    if (
      event.name === "product_added" &&
      event.properties.after_pack === true &&
      !pack
    ) {
      const id = String(event.properties.product);
      if (productById.has(id)) addons.set(id, (addons.get(id) ?? 0) + 1);
    }
    if (
      event.name === "pack_group_selected" &&
      event.properties.group_size !== "all"
    ) {
      const previous = groups.get(event.session_id);
      if (!previous || event.created_at >= previous.at)
        groups.set(event.session_id, {
          at: event.created_at,
          value: String(event.properties.group_size),
        });
    }
  }
  const checkouts = db.simulated_orders.filter(
    (order) => order.reached_checkout || order.converted_to_lead,
  );
  const packCheckouts = checkouts.filter((order) =>
    order.items.some((item) => isPack(item.id)),
  );
  const orders = db.simulated_orders.filter((order) => order.items.length);
  const withPacks = orders.filter((order) =>
    order.items.some((item) => isPack(item.id)),
  );
  const withoutPacks = orders.filter(
    (order) => !order.items.some((item) => isPack(item.id)),
  );
  const average = (rows: typeof orders) =>
    rows.length
      ? Math.round(
          rows.reduce((sum, order) => sum + order.subtotal, 0) / rows.length,
        )
      : 0;
  const groupCounts = new Map<string, number>();
  for (const group of groups.values())
    groupCounts.set(group.value, (groupCounts.get(group.value) ?? 0) + 1);
  return {
    profiles: profiles.size,
    viewed: views.size,
    added: additions.size,
    viewRate: profiles.size ? (views.size / profiles.size) * 100 : 0,
    addRate: profiles.size ? (additions.size / profiles.size) * 100 : 0,
    checkoutShare: checkouts.length
      ? (packCheckouts.length / checkouts.length) * 100
      : 0,
    packAov: average(withPacks),
    nonPackAov: average(withoutPacks),
    packs: [...packById.values()]
      .map((pack) => ({
        id: pack.id,
        name: pack.name,
        units: orders.reduce(
          (sum, order) =>
            sum +
            (order.items.find((item) => item.id === pack.id)?.quantity ?? 0),
          0,
        ),
        checkouts: checkouts.filter((order) =>
          order.items.some((item) => item.id === pack.id),
        ).length,
      }))
      .sort((a, b) => b.units - a.units),
    groups: [...groupCounts]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name: name.replaceAll("-", "–"), value })),
    addons: [...addons]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, value]) => ({ name: productById.get(id)!.name, value })),
  };
}
