import type { Attribution, Database } from "@/types";
import { categories, getCatalogItem } from "./products";
function campaignKey(entry: Attribution) {
  return JSON.stringify([
    entry.utm_campaign || "Sem campanha",
    entry.utm_source || "Direto",
    entry.utm_medium || "—",
  ]);
}
export function summarize(db: Database) {
  const events = db.analytics_events;
  const orders = db.simulated_orders;
  const currentBaskets = orders.filter((o) => o.items.length > 0);
  const leadsBySession = new Map(
    db.leads.map((lead) => [lead.session_id, lead]),
  );
  const visitors = new Set(
    events.filter((e) => e.name === "landing_view").map((e) => e.session_id),
  ).size;
  const checkout = orders.filter(
    (o) => o.reached_checkout || o.converted_to_lead,
  ).length;
  const converted = orders.filter((o) => o.converted_to_lead).length;
  const gmv = currentBaskets.reduce((sum, o) => sum + o.total, 0);
  const subtotal = currentBaskets.reduce((sum, o) => sum + o.subtotal, 0);
  const productCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  // Saved basket lines measure current intent; repeated add/remove clicks do not.
  for (const order of currentBaskets)
    for (const item of order.items) {
      productCounts.set(
        item.id,
        (productCounts.get(item.id) || 0) + item.quantity,
      );
      categoryCounts.set(
        item.category,
        (categoryCounts.get(item.category) || 0) + item.quantity,
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
      checkout: number;
      converted: number;
      leads: number;
      gmv: number;
    }
  >();
  for (const entry of [...orders, ...db.leads]) {
    const name = entry.utm_campaign || "Sem campanha";
    const source = entry.utm_source || "Direto";
    const medium = entry.utm_medium || "—";
    const key = campaignKey(entry);
    const row = campaigns.get(key) || {
      name,
      source,
      medium,
      orders: 0,
      checkout: 0,
      converted: 0,
      leads: 0,
      gmv: 0,
    };
    if ("email" in entry) row.leads++;
    else {
      row.orders++;
      if (entry.reached_checkout || entry.converted_to_lead) row.checkout++;
      const lead = leadsBySession.get(entry.session_id);
      // A later campaign visit can change this browser's current basket;
      // its earlier signup must not become a conversion for that campaign.
      if (entry.converted_to_lead && lead && campaignKey(lead) === key)
        row.converted++;
      row.gmv += entry.total;
    }
    campaigns.set(key, row);
  }
  return {
    visitors,
    started: orders.length,
    checkout,
    converted,
    beforeCheckout: orders.length - checkout,
    withoutContact: checkout - converted,
    checkoutConversion: checkout ? (converted / checkout) * 100 : 0,
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
    campaigns: [...campaigns.values()]
      .map((row) => ({
        ...row,
        conversion: row.orders ? (row.converted / row.orders) * 100 : 0,
      }))
      .sort((a, b) => b.converted - a.converted || b.orders - a.orders),
  };
}
