"use client";
import type { Attribution } from "@/types";
import { eventNames } from "./validation";
type EventName = (typeof eventNames)[number];
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? (JSON.parse(data) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing still supports the in-memory journey. */
  }
}
let memorySession: string | undefined;
export function getSession() {
  if (memorySession) return memorySession;
  const previous = readLocal<string | null>("jola_session", null);
  memorySession =
    previous && /^[0-9a-f-]{36}$/i.test(previous)
      ? previous
      : crypto.randomUUID();
  writeLocal("jola_session", memorySession);
  return memorySession;
}
export function captureAttribution(): Attribution {
  const params = new URLSearchParams(window.location.search);
  const previous = readLocal<Attribution>("jola_utm", {});
  if (!params.has("utm_source") && !params.has("utm_campaign")) return previous;
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
  return readLocal("jola_utm", {});
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
    console.info("[Jola analytics]", name, payload.properties);
  window.dispatchEvent(new CustomEvent("jola:analytics", { detail: payload }));
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}
