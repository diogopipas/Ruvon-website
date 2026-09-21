export type Category =
  "cerveja" | "vinho" | "spirits" | "gelo" | "mixers" | "snacks" | "festa";
export type Product = {
  id: string;
  name: string;
  size: string;
  price: number;
  category: Category;
  art: string;
  color: string;
  label: string;
  tag?: string;
};
export type Pack = {
  id: string;
  name: string;
  price: number;
  people: string;
  description: string;
  contents: string[];
  color: string;
  items: string[];
};
export type CartItem = { id: string; quantity: number };
export type BasketItem = CartItem & {
  name: string;
  category: string;
  price: number;
};
export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
};
export type Location = { city: string; postcode: string; street?: string };
export type SimulatedOrder = Attribution & {
  id: string;
  created_at: string;
  updated_at: string;
  session_id: string;
  city: string;
  postcode: string;
  items: BasketItem[];
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
  converted_to_lead: boolean;
  reached_checkout: boolean;
};
export type Lead = Attribution & {
  id: string;
  created_at: string;
  session_id: string;
  email: string | null;
  phone: string | null;
  city: string;
  postcode: string;
  basket_total: number;
  basket_items: BasketItem[];
  consent_at: string;
};
export type Merchant = {
  id: string;
  created_at: string;
  store_name: string;
  city: string;
  contact_name: string;
  contact: string;
  consent_at: string;
};
export type AnalyticsEvent = {
  id: string;
  created_at: string;
  session_id: string;
  name: string;
  properties: Record<string, unknown>;
};
export type Database = {
  leads: Lead[];
  simulated_orders: SimulatedOrder[];
  merchant_interests: Merchant[];
  analytics_events: AnalyticsEvent[];
};
