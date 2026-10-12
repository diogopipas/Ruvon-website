import type { DeliveryAddress } from "@/lib/commerce";
export type OpeningHours = Record<string, { start: string; end: string }[]>;
export type Store = {
  id: string;
  name: string;
  enabled: boolean;
  paused: boolean;
  pickup_address: DeliveryAddress;
  phone: string;
  email: string;
  timezone: string;
  opening_hours: OpeningHours;
  delivery_postcodes: string[];
  commission_bps: number;
  service_fee: number;
  preparation_minutes: number;
  heartbeat_at: string | null;
  easypay_account_id: string | null;
  clearing_period: string | null;
  release_delay_days: number | null;
};
function minutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
export function validateHours(hours: OpeningHours) {
  return Object.entries(hours).every(
    ([day, spans]) =>
      /^[0-6]$/.test(day) &&
      Array.isArray(spans) &&
      spans.every(
        (s) =>
          /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.start) &&
          /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.end) &&
          s.start !== s.end,
      ),
  );
}
export function storeOpen(store: Store, now = new Date()) {
  if (!validateHours(store.opening_hours)) return false;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: store.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.weekday,
  );
  const current = Number(parts.hour) * 60 + Number(parts.minute);
  return (
    (store.opening_hours[String(day)] ?? []).some((s) =>
      minutes(s.start) < minutes(s.end)
        ? current >= minutes(s.start) && current < minutes(s.end)
        : current >= minutes(s.start),
    ) ||
    (store.opening_hours[String((day + 6) % 7)] ?? []).some(
      (s) => minutes(s.start) > minutes(s.end) && current < minutes(s.end),
    )
  );
}
export function eligibleStore(
  store: Store,
  address: DeliveryAddress,
  now = new Date(),
) {
  const heartbeat = store.heartbeat_at ? Date.parse(store.heartbeat_at) : 0;
  return (
    store.enabled &&
    !store.paused &&
    heartbeat <= now.getTime() + 5000 &&
    now.getTime() - heartbeat <= 90000 &&
    store.delivery_postcodes.includes(address.zip_code) &&
    storeOpen(store, now)
  );
}
