import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLatestWriter,
  HttpResponseError,
  postJson,
} from "@/lib/client-request";
import { checkoutKey, locationKey } from "@/lib/journey";

function browserStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("recoverable client requests", () => {
  it("coalesces many edits during a slow write into one latest snapshot", async () => {
    let release!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = vi
      .fn()
      .mockImplementationOnce(() => firstWrite)
      .mockResolvedValue(undefined);
    const save = createLatestWriter<number>(write);
    const first = save(1);
    await Promise.resolve();
    const waiting = Array.from({ length: 40 }, (_, index) => save(index + 2));
    expect(waiting.every((promise) => promise === first)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, ...waiting]);
    expect(write.mock.calls.map(([snapshot]) => snapshot)).toEqual([1, 41]);
  });

  it("fails a stalled flush once instead of retrying every pending edit, then permits a deliberate retry", async () => {
    let reject!: (reason: Error) => void;
    const firstWrite = new Promise<void>((_resolve, fail) => {
      reject = fail;
    });
    const write = vi
      .fn()
      .mockImplementationOnce(() => firstWrite)
      .mockResolvedValue(undefined);
    const save = createLatestWriter<number>(write);
    const first = save(1);
    await Promise.resolve();
    const latest = save(20);
    const rejected = expect(first).rejects.toThrow("Offline");
    reject(new Error("Offline"));
    await rejected;
    expect(latest).toBe(first);
    expect(write).toHaveBeenCalledTimes(1);
    await save(20);
    expect(write.mock.calls.map(([snapshot]) => snapshot)).toEqual([1, 20]);
  });

  it("returns successful data and preserves useful validation errors", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Indica a tua cidade." }), {
          status: 400,
        }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(postJson("/api/orders", { items: [] })).resolves.toEqual({
      ok: true,
    });
    const rejected = await postJson("/api/leads", {}).catch(
      (error: unknown) => error,
    );
    expect(rejected).toBeInstanceOf(HttpResponseError);
    expect(rejected).toMatchObject({
      status: 400,
      message: "Indica a tua cidade.",
    });
  });

  it("bounds a stalled request so the caller can retry", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_path: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const pending = expect(postJson("/api/orders", {})).rejects.toThrow(
      "A ligação demorou demasiado",
    );
    await vi.advanceTimersByTimeAsync(12_000);
    await pending;
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives recoverable Portuguese errors for offline and non-JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(new Response("Bad gateway", { status: 502 })),
    );
    await expect(postJson("/api/leads", {})).rejects.toThrow("Sem ligação");
    await expect(postJson("/api/leads", {})).rejects.toThrow("Tenta novamente");
  });

  it("keeps customer submissions on the same origin", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      postJson("https://other.example/api/leads", {}),
    ).rejects.toThrow("Destino");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("checkout journey boundaries", () => {
  it("recovers the same basket regardless of item order, but separates changed baskets and city-only journeys", () => {
    const basket = [
      { id: "gelo", quantity: 1 },
      { id: "super-bock", quantity: 2 },
    ];
    expect(checkoutKey(basket, false)).toBe(
      checkoutKey([...basket].reverse(), false),
    );
    expect(checkoutKey(basket, false)).not.toBe(
      checkoutKey([{ id: "gelo", quantity: 2 }], false),
    );
    expect(checkoutKey(basket, false)).not.toBe(
      checkoutKey(basket, true, "Lisboa"),
    );
    expect(checkoutKey([], true, "Lisboa")).not.toBe(
      checkoutKey([], true, "Porto"),
    );
    expect(locationKey({ city: " Lisboa " })).toBe(
      locationKey({ city: "lisboa" }),
    );
    expect(locationKey({ city: "Lisboa" })).not.toBe(
      locationKey({ city: "Porto" }),
    );
  });
});

describe("attribution and analytics lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", browserStorage());
    vi.stubGlobal("sessionStorage", browserStorage());
    vi.stubGlobal("window", {
      location: { search: "" },
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  });

  it("retains campaign attribution through untagged navigation and captures a new campaign", async () => {
    const { captureAttribution, attribution } = await import("@/lib/analytics");
    window.location.search =
      "?utm_source=instagram&utm_campaign=first&utm_content=video";
    captureAttribution();
    window.location.search = "";
    expect(attribution()).toEqual({
      utm_source: "instagram",
      utm_campaign: "first",
      utm_content: "video",
    });
    window.location.search = "?utm_source=newsletter&utm_campaign=second";
    expect(attribution()).toEqual({
      utm_source: "newsletter",
      utm_campaign: "second",
    });
  });

  it("survives blocked localStorage without losing session or attribution", async () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("Blocked");
      },
      setItem() {
        throw new Error("Blocked");
      },
    });
    const { captureAttribution, attribution, getSession } =
      await import("@/lib/analytics");
    window.location.search = "?utm_campaign=private";
    captureAttribution();
    window.location.search = "";
    expect(attribution()).toEqual({ utm_campaign: "private" });
    expect(getSession()).toBe(getSession());
  });

  it("prefers a newer in-memory campaign when quota blocks writes but persisted reads still work", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ utm_campaign: "old" }),
      setItem() {
        throw new Error("Quota exceeded");
      },
    });
    const { captureAttribution, attribution } = await import("@/lib/analytics");
    window.location.search = "?utm_campaign=new";
    captureAttribution();
    window.location.search = "";
    expect(attribution()).toEqual({ utm_campaign: "new" });
  });

  it("keeps the newest contact draft when sessionStorage writes fail", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => JSON.stringify({ email: "old@example.com" }),
      setItem() {
        throw new Error("Quota exceeded");
      },
    });
    const { readJourney, writeJourney } = await import("@/lib/journey");
    writeJourney("jola_contact_draft", { email: "new@example.com" });
    expect(readJourney("jola_contact_draft", null)).toEqual({
      email: "new@example.com",
    });
  });

  it("drops malformed persisted attribution and replaces invalid session IDs", async () => {
    localStorage.setItem("jola_utm", JSON.stringify({ utm_campaign: 42 }));
    localStorage.setItem("jola_session", JSON.stringify("a".repeat(36)));
    const { attribution, getSession } = await import("@/lib/analytics");
    expect(attribution()).toEqual({});
    expect(getSession()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("deduplicates lifecycle and product impressions while preserving real repeated additions", async () => {
    const { trackOnce, track } = await import("@/lib/analytics");
    trackOnce("landing_view");
    trackOnce("landing_view");
    trackOnce("product_viewed", { product: "gelo" }, "product_viewed:gelo");
    trackOnce("product_viewed", { product: "gelo" }, "product_viewed:gelo");
    track("product_added", { product: "gelo" });
    track("product_added", { product: "gelo" });
    expect(fetch).toHaveBeenCalledTimes(4);
    // Remount/reload protection lives in sessionStorage, beyond the module set.
    vi.resetModules();
    const reloaded = await import("@/lib/analytics");
    reloaded.trackOnce("landing_view");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("keeps commerce, sandbox and staff journeys out of validation analytics", async () => {
    const { validationJourneyAllowed, track, trackOnce, captureAttribution } =
      await import("@/lib/analytics");
    expect(validationJourneyAllowed("commerce", "/checkout")).toBe(false);
    expect(validationJourneyAllowed("sandbox", "/pedir")).toBe(false);
    expect(
      validationJourneyAllowed("commerce", "/checkout", "?interesse=1"),
    ).toBe(true);
    for (const pathname of ["/merchant", "/admin/orders", "/pedido/owned"]) {
      window.location.pathname = pathname;
      window.location.search = "?utm_campaign=private";
      track("checkout_started", { address: "must never be sent" });
      trackOnce("landing_view");
      expect(captureAttribution()).toEqual({});
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem("jola_session")).toBeNull();
    vi.stubGlobal("document", {
      documentElement: { dataset: { ruvonMode: "commerce" } },
    });
    window.location.pathname = "/checkout";
    track("checkout_started");
    expect(fetch).not.toHaveBeenCalled();
  });
});
