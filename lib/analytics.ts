"use client";
import type { Attribution } from "@/types";
import { attributionSchema, eventNames } from "./validation";
type EventName = (typeof eventNames)[number];
const memoryStorage = new Map<string, string>();
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const data = memoryStorage.get(key) ?? localStorage.getItem(key);
    return data ? (JSON.parse(data) as T) : fallback;
  } catch {
    const data = memoryStorage.get(key);
    return data ? (JSON.parse(data) as T) : fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  const data = JSON.stringify(value);
  memoryStorage.set(key, data);
  try {
    localStorage.setItem(key, data);
  } catch {
    /* Private browsing still supports the in-memory journey. */
  }
}
let memorySession: string | undefined;
export function getSession() {
  if (memorySession) return memorySession;
  const previous = readLocal<string | null>("jola_session", null);
  memorySession =
    typeof previous === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      previous,
    )
      ? previous
      : crypto.randomUUID();
  writeLocal("jola_session", memorySession);
  return memorySession;
}
export function captureAttribution(): Attribution {
  const parsed = attributionSchema.safeParse(readLocal("jola_utm", {}));
  const previous = parsed.success ? parsed.data : {};
  if (typeof window === "undefined") return previous;
  const params = new URLSearchParams(window.location.search);
  if (
    !["utm_source", "utm_medium", "utm_campaign", "utm_content"].some((key) =>
      params.has(key),
    )
  )
    return previous;
  const current: Attribution = {};
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
  ] as const) {
    const value = params.get(key);
    if (value) current[key] = value.slice(0, 160);
  }
  writeLocal("jola_utm", current);
  return current;
}
export function attribution(): Attribution {
  return captureAttribution();
}
const seenEvents = new Set<string>();
/** One lifecycle/impression event per tab journey, including reloads. */
export function trackOnce(
  name: EventName,
  properties: Record<string, unknown> = {},
  key: string = name,
) {
  const identity = `${getSession()}:${key}`;
  if (seenEvents.has(identity)) return;
  try {
    if (sessionStorage.getItem(`jola_event:${identity}`)) return;
    sessionStorage.setItem(`jola_event:${identity}`, "1");
  } catch {
    // The in-memory set still prevents rerender duplicates.
  }
  seenEvents.add(identity);
  track(name, properties);
}
export function track(
  name: EventName,
  properties: Record<string, unknown> = {},
) {
  const payload = {
    id: crypto.randomUUID(),
    session_id: getSession(),
    name,
    properties: { ...attribution(), ...properties },
  };
  if (process.env.NODE_ENV === "development")
    console.info("[Ruvon analytics]", name, payload.properties);
  window.dispatchEvent(new CustomEvent("jola:analytics", { detail: payload }));
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}
