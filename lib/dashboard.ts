import type { Attribution, Database } from "@/types";
import { categories, getCatalogItem } from "./products";

export type DashboardCity = "all" | "Faro" | "Lisboa";

const cityKey = (city: string) => city.trim().toLocaleLowerCase("pt");

/** Assign pre-location events to the city eventually saved for that browser. */
export function filterDashboardCity(
  db: Database,
  city: DashboardCity,
): Database {
  if (city === "all") return db;
  const cities = new Map<string, string>();
  for (const event of [...db.analytics_events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )) {
    if (
      event.name === "location_entered" &&
      typeof event.properties.city === "string"
    )
      cities.set(event.session_id, event.properties.city);
  }
  for (const order of db.simulated_orders)
    if (order.city) cities.set(order.session_id, order.city);
  for (const lead of db.leads)
    if (lead.city) cities.set(lead.session_id, lead.city);
  const matches = (session: string) =>
    cityKey(cities.get(session) || "") === cityKey(city);
  return {
    leads: db.leads.filter((lead) => matches(lead.session_id)),
    simulated_orders: db.simulated_orders.filter((order) =>
      matches(order.session_id),
    ),
    merchant_interests: db.merchant_interests.filter(
      (store) => cityKey(store.city) === cityKey(city),
    ),
    analytics_events: db.analytics_events.filter((event) =>
      matches(event.session_id),
    ),
  };
}
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
      sessions: Set<string>;
      leads: Set<string>;
    }
  >();
  for (const entry of [...orders, ...db.leads]) {
    if (!entry.city) continue;
    const key = entry.city.trim().toLocaleLowerCase("pt");
    const value = locations.get(key) || {
      city: entry.city,
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
  const campaignCities = new Map<
    string,
    {
      campaign: string;
      content: string;
      source: string;
      city: string;
      started: number;
      checkouts: number;
      contacts: number;
      baskets: number;
      subtotal: number;
      gmv: number;
    }
  >();
  const citiesBySession = new Map(
    orders.map((order) => [order.session_id, order.city]),
  );
  for (const lead of db.leads) citiesBySession.set(lead.session_id, lead.city);
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
    const content = entry.utm_content || "—";
    const city = citiesBySession.get(entry.session_id) || "Sem cidade";
    const cityCampaignKey = JSON.stringify([
      name,
      content,
      source,
      cityKey(city),
    ]);
    const cityRow = campaignCities.get(cityCampaignKey) || {
      campaign: name,
      content,
      source,
      city,
      started: 0,
      checkouts: 0,
      contacts: 0,
      baskets: 0,
      subtotal: 0,
      gmv: 0,
    };
    if ("email" in entry) cityRow.contacts++;
    else {
      cityRow.started++;
      if (entry.reached_checkout || entry.converted_to_lead)
        cityRow.checkouts++;
      if (entry.items.length) {
        cityRow.baskets++;
        cityRow.subtotal += entry.subtotal;
        cityRow.gmv += entry.total;
      }
    }
    campaignCities.set(cityCampaignKey, cityRow);
  }
  return {
    visitors,
    started: orders.length,
    checkout,
    converted,
    beforeCheckout: orders.length - checkout,
    withoutContact: checkout - converted,
    checkoutConversion: checkout ? (converted / checkout) * 100 : 0,
    orderToCheckout: orders.length ? (checkout / orders.length) * 100 : 0,
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
        demand: row.sessions.size,
        leads: row.leads.size,
      })),
    campaigns: [...campaigns.values()]
      .map((row) => ({
        ...row,
        conversion: row.orders ? (row.converted / row.orders) * 100 : 0,
      }))
      .sort((a, b) => b.converted - a.converted || b.orders - a.orders),
    campaignCities: [...campaignCities.values()]
      .map(({ baskets, subtotal, ...row }) => ({
        ...row,
        aov: baskets ? Math.round(subtotal / baskets) : 0,
      }))
      .sort(
        (a, b) =>
          a.campaign.localeCompare(b.campaign, "pt") ||
          a.content.localeCompare(b.content, "pt") ||
          a.source.localeCompare(b.source, "pt") ||
          a.city.localeCompare(b.city, "pt"),
      ),
  };
}
