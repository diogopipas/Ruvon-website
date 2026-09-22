import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getSupabase, isLocalStorage } from "./supabase";
import { priceBasket } from "../pricing";
import type { LeadInput, OrderInput } from "../validation";
import type {
  AnalyticsEvent,
  Database,
  Lead,
  Merchant,
  SimulatedOrder,
} from "@/types";
const empty = (): Database => ({
  leads: [],
  simulated_orders: [],
  merchant_interests: [],
  analytics_events: [],
});
const file = path.join(
  process.cwd(),
  process.env.JOLA_DATA_DIR || ".data",
  "jola.json",
);
const globalQueue = globalThis as typeof globalThis & {
  jolaWrites?: Promise<unknown>;
};
async function localRead(): Promise<Database> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw error;
  }
}
async function localWrite<T>(mutation: (db: Database) => T): Promise<T> {
  if (!isLocalStorage()) throw new Error("Storage is not configured.");
  const next = (globalQueue.jolaWrites ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      const db = await localRead();
      const result = mutation(db);
      await mkdir(path.dirname(file), { recursive: true });
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
      await rename(temp, file);
      return result;
    });
  globalQueue.jolaWrites = next;
  return next;
}
function makeOrder(input: OrderInput): SimulatedOrder {
  const priced = priceBasket(input.items);
  const now = new Date().toISOString();
  return {
    id: input.session_id,
    session_id: input.session_id,
    created_at: now,
    updated_at: now,
    city: input.location?.city ?? "",
    postcode: input.location?.postcode ?? "",
    items: priced.items,
    subtotal: priced.subtotal,
    delivery_fee: priced.delivery_fee,
    service_fee: priced.service_fee,
    total: priced.total,
    converted_to_lead: false,
    reached_checkout: input.reached_checkout,
    ...input.attribution,
  };
}
function mergeOrder(db: Database, order: SimulatedOrder) {
  const previous = db.simulated_orders.find(
    (o) => o.session_id === order.session_id,
  );
  if (previous)
    Object.assign(previous, order, {
      created_at: previous.created_at,
      converted_to_lead: previous.converted_to_lead,
      reached_checkout: previous.reached_checkout || order.reached_checkout,
      city: order.city || previous.city,
      postcode: order.postcode || previous.postcode,
    });
  else if (order.items.length) db.simulated_orders.push(order);
}
export async function saveOrder(input: OrderInput) {
  const order = makeOrder(input);
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.rpc("save_simulated_order", {
      order_data: order,
    });
    if (error) throw error;
  } else await localWrite((db) => mergeOrder(db, order));
}
export async function saveLead(input: LeadInput) {
  const order = makeOrder({
    ...input,
    reached_checkout: input.items.length > 0,
  });
  const now = new Date().toISOString();
  const lead: Lead = {
    id: randomUUID(),
    created_at: now,
    session_id: input.session_id,
    email: input.contact.includes("@") ? input.contact.toLowerCase() : null,
    phone: input.contact.includes("@")
      ? null
      : input.contact.replace(/[\s()-]/g, ""),
    city: input.location.city,
    postcode: input.location.postcode,
    basket_total: order.total,
    basket_items: order.items,
    consent_at: now,
    ...input.attribution,
  };
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.rpc("capture_lead", {
      lead_data: lead,
      order_data: order.items.length ? order : null,
    });
    if (error) throw error;
  } else
    await localWrite((db) => {
      const previous = db.leads.find((l) => l.session_id === input.session_id);
      if (previous)
        Object.assign(previous, lead, {
          id: previous.id,
          created_at: previous.created_at,
          basket_items: lead.basket_items.length
            ? lead.basket_items
            : previous.basket_items,
          basket_total: lead.basket_items.length
            ? lead.basket_total
            : previous.basket_total,
        });
      else db.leads.push(lead);
      if (order.items.length) {
        mergeOrder(db, order);
        db.simulated_orders.find(
          (o) => o.session_id === input.session_id,
        )!.converted_to_lead = true;
      }
    });
}
export async function saveEvent(event: AnalyticsEvent) {
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from("analytics_events")
      .upsert(event, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  } else
    await localWrite((db) => {
      if (!db.analytics_events.some((e) => e.id === event.id))
        db.analytics_events.push(event);
    });
}
export async function saveMerchant(merchant: Merchant) {
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from("merchant_interests")
      .upsert(merchant, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  } else
    await localWrite((db) => {
      if (!db.merchant_interests.some((entry) => entry.id === merchant.id))
        db.merchant_interests.push(merchant);
    });
}
export async function readDatabase(): Promise<Database> {
  const supabase = getSupabase();
  if (!supabase) {
    if (!isLocalStorage())
      throw new Error("Configura o Supabase para começar a recolher procura.");
    await globalQueue.jolaWrites?.catch(() => undefined);
    return localRead();
  }
  const db = empty();
  await Promise.all(
    (Object.keys(db) as (keyof Database)[]).map(async (table) => {
      const rows: unknown[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .order("created_at", { ascending: false })
          .order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      Object.assign(db, { [table]: rows });
    }),
  );
  return db;
}
