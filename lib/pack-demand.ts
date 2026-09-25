import type { Database } from "@/types";
import { packById, productById } from "./products";
import { componentChoices } from "./packs";

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
  const customizations = new Map<
    string,
    {
      pack: string;
      option: string;
      from: string;
      to: string;
      source: string;
      count: number;
    }
  >();
  for (const event of db.analytics_events) {
    if (
      event.name === "pack_options_changed" &&
      Array.isArray(event.properties.changes)
    ) {
      const configuredPack = packById.get(String(event.properties.pack_id));
      for (const change of event.properties.changes) {
        if (!configuredPack || !change || typeof change !== "object") continue;
        const part = [...configuredPack.core, ...configuredPack.extras].find(
          (part) => part.key === change.option,
        );
        if (!part) continue;
        const choices = componentChoices(
          part,
          configuredPack.extras.some((extra) => extra.key === part.key),
        );
        const from = choices.find((choice) => choice.value === change.from);
        const to = choices.find((choice) => choice.value === change.to);
        if (!from || !to || from.value === to.value) continue;
        const source =
          event.properties.source === "cart" ? "No carrinho" : "A explorar";
        const key = JSON.stringify([
          configuredPack.id,
          part.key,
          from.value,
          to.value,
          source,
        ]);
        const row = customizations.get(key) ?? {
          pack: configuredPack.name,
          option: part.label,
          from: from.label,
          to: to.label,
          source,
          count: 0,
        };
        customizations.set(key, { ...row, count: row.count + 1 });
      }
    }
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
    customizations: [...customizations.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  };
}
