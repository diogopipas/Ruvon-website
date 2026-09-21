import type { Database } from "@/types";
import { categories, getCatalogItem } from "./products";
export function summarize(db: Database) {
  const events = db.analytics_events;
  const orders = db.simulated_orders;
  const currentBaskets = orders.filter((o) => o.items.length > 0);
  const visitors = new Set(
    events.filter((e) => e.name === "landing_view").map((e) => e.session_id),
  ).size;
  const checkout = orders.filter((o) => o.reached_checkout).length;
  const converted = orders.filter((o) => o.converted_to_lead).length;
  const gmv = currentBaskets.reduce((sum, o) => sum + o.total, 0);
  const subtotal = currentBaskets.reduce((sum, o) => sum + o.subtotal, 0);
  const productCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  for (const event of events.filter((e) => e.name === "product_added")) {
    const id = String(event.properties.product || "");
    const category = String(event.properties.category || "");
    productCounts.set(
      id,
      (productCounts.get(id) || 0) + Number(event.properties.quantity || 1),
    );
    categoryCounts.set(
      category,
      (categoryCounts.get(category) || 0) +
        Number(event.properties.quantity || 1),
    );
  }
  const locations = new Map<
    string,
    {
      city: string;
      postcode: string;
      sessions: Set<string>;
      leads: Set<string>;
    }
  >();
  for (const entry of [...orders, ...db.leads]) {
    if (!entry.city) continue;
    const key = `${entry.city.toLocaleLowerCase("pt")}|${entry.postcode}`;
    const value = locations.get(key) || {
      city: entry.city,
      postcode: entry.postcode,
      sessions: new Set<string>(),
      leads: new Set<string>(),
    };
    value.sessions.add(entry.session_id);
    if ("email" in entry) value.leads.add(entry.session_id);
    locations.set(key, value);
  }
  const campaigns = new Map<
    string,
    {
      name: string;
      source: string;
      medium: string;
      orders: number;
      leads: number;
      gmv: number;
    }
  >();
  for (const entry of [...orders, ...db.leads]) {
    const name = entry.utm_campaign || "Sem campanha";
    const source = entry.utm_source || "Direto";
    const medium = entry.utm_medium || "—";
    const key = JSON.stringify([name, source, medium]);
    const row = campaigns.get(key) || {
      name,
      source,
      medium,
      orders: 0,
      leads: 0,
      gmv: 0,
    };
    if ("email" in entry) row.leads++;
    else {
      row.orders++;
      row.gmv += entry.total;
    }
    campaigns.set(key, row);
  }
  return {
    visitors,
    started: orders.length,
    checkout,
    leads: db.leads.length,
    gmv,
    average: currentBaskets.length
      ? Math.round(subtotal / currentBaskets.length)
      : 0,
    conversion: orders.length ? (converted / orders.length) * 100 : 0,
    cta: events.filter((e) => e.name === "order_cta_clicked").length,
    products: [...productCounts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, value]) => ({ name: getCatalogItem(id)?.name || id, value })),
    categories: [...categoryCounts]
      .sort((a, b) => b[1] - a[1])
      .map(([id, value]) => ({
        name:
          categories.find((c) => c.id === id)?.name ||
          (id === "packs" ? "Packs" : id),
        value,
      })),
    locations: [...locations.values()]
      .sort((a, b) => b.sessions.size - a.sessions.size)
      .slice(0, 10)
      .map((row) => ({
        city: row.city,
        postcode: row.postcode,
        demand: row.sessions.size,
        leads: row.leads.size,
      })),
    campaigns: [...campaigns.values()].sort((a, b) => b.leads - a.leads),
  };
}
