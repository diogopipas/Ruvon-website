import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import type { CommerceOrder } from "@/lib/commerce";
vi.mock("server-only", () => ({}));
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/server/orders/repository", () => ({
  orderRepository: () => ({ rpc }),
}));
import { emailConfig, sendEmail } from "@/lib/server/notifications/resend";
import {
  emailRequest,
  notificationText,
} from "@/lib/server/notifications/templates";
import {
  ingestResend,
  verifyResendSignature,
} from "@/lib/server/notifications/webhook";

beforeEach(() => {
  rpc.mockReset();
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("RESEND_DOMAIN", "ruvon.store");
  vi.stubEnv("RESEND_FROM", "Ruvon <pedidos@ruvon.store>");
  vi.stubEnv("RESEND_REPLY_TO", "operator@example.com");
  vi.stubEnv("RUVON_PAYMENTS_MODE", "sandbox");
  vi.stubEnv("VERCEL_ENV", "preview");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function signed(raw: Buffer, timestamp = Math.floor(Date.now() / 1000)) {
  const secret = `whsec_${Buffer.from("synthetic-test-secret-not-a-real-key").toString("base64")}`;
  const id = `msg_${randomUUID()}`;
  const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(`${id}.${timestamp}.`)
    .update(raw)
    .digest("base64");
  return {
    secret,
    headers: new Headers({
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(timestamp),
      "svix-signature": `v1,${signature}`,
    }),
  };
}

describe("Resend contract", () => {
  it("uses the frozen request and same provider identity on retry", async () => {
    const id = randomUUID();
    const fetcher = vi
      .fn()
      .mockImplementation(async () => Response.json({ id }));
    vi.stubGlobal("fetch", fetcher);
    const body = emailRequest(
      randomUUID(),
      "sandbox",
      emailConfig(),
      "merchant@example.com",
      { subject: "Novo pedido", text: "Abrir painel autenticado" },
    );
    expect(await sendEmail(body, "notification:stable-key")).toBe(id);
    expect(await sendEmail(body, "notification:stable-key")).toBe(id);
    expect(fetcher.mock.calls[0][1].headers).toEqual(
      fetcher.mock.calls[1][1].headers,
    );
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.resend.com/emails");
    expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      "notification:stable-key",
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(body);
  });
  it("rejects an unrelated sender domain before any request", () => {
    vi.stubEnv("RESEND_FROM", "Ruvon <attacker@example.com>");
    expect(emailConfig).toThrow("invalid_email_sender");
  });
  it("keeps transport uncertainty distinct from rejection and validates response IDs", async () => {
    const body = emailRequest(
      randomUUID(),
      "live",
      emailConfig(),
      "a@example.com",
      { subject: "Test", text: "Test" },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private contact payload")),
    );
    await expect(sendEmail(body, "key")).rejects.toMatchObject({
      classification: "transport_unknown",
      definitive: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 422 })),
    );
    await expect(sendEmail(body, "key")).rejects.toMatchObject({
      classification: "http_422",
      definitive: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ id: "invalid" })),
    );
    await expect(sendEmail(body, "key")).rejects.toMatchObject({
      classification: "invalid_email_response",
      definitive: false,
    });
  });
});

describe("signed delivery callbacks", () => {
  it("matches the published Svix vector and protects exact Unicode bytes, timestamp and rotation", () => {
    const known = new Headers({
      "svix-id": "msg_loFOjxBNrRLzqYUf",
      "svix-timestamp": "1731705121",
      "svix-signature": "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=",
    });
    expect(
      verifyResendSignature(
        Buffer.from('{"event_type":"ping","data":{"success":true}}'),
        known,
        "whsec_plJ3nmyCDGBKInavdOK15jsl",
        1731705121000,
      ),
    ).toBe(true);
    const raw = Buffer.from('{"subject":"ação 🍋"}');
    const { headers, secret } = signed(raw);
    expect(verifyResendSignature(raw, headers, secret)).toBe(true);
    expect(
      verifyResendSignature(
        Buffer.from(raw.toString().normalize("NFD")),
        headers,
        secret,
      ),
    ).toBe(false);
    expect(
      verifyResendSignature(raw, headers, secret, Date.now() + 301000),
    ).toBe(false);
    headers.set(
      "svix-signature",
      `v1,ZmFrZQ== ${headers.get("svix-signature")}`,
    );
    expect(verifyResendSignature(raw, headers, secret)).toBe(true);
  });
  it("persists only verified references, excluding email bodies, recipients and subjects", async () => {
    const nid = randomUUID();
    const raw = Buffer.from(
      JSON.stringify({
        type: "email.delivered",
        created_at: new Date().toISOString(),
        data: {
          email_id: randomUUID(),
          from: "Ruvon <pedidos@ruvon.store>",
          to: ["private@example.com"],
          subject: "private subject",
          tags: { notification_id: nid, environment: "sandbox" },
        },
      }),
    );
    const { headers, secret } = signed(raw);
    vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
    await ingestResend(
      new Request("https://ruvon.store/api/webhooks/resend", {
        method: "POST",
        headers,
        body: raw,
      }),
    );
    expect(rpc).toHaveBeenCalledOnce();
    const stored = rpc.mock.calls[0][1].p_data;
    expect(stored.payload).toEqual({
      type: "email.delivered",
      from: "pedidos@ruvon.store",
      notification_id: nid,
      quarantine_reason: null,
    });
    expect(JSON.stringify(stored)).not.toContain("private");
    headers.set("svix-signature", "v1,ZmFrZQ==");
    await expect(
      ingestResend(
        new Request("https://ruvon.store/api/webhooks/resend", {
          method: "POST",
          headers,
          body: raw,
        }),
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("durably quarantines authenticated messages without this application's tags", async () => {
    const raw = Buffer.from(
      JSON.stringify({
        type: "email.delivered",
        created_at: new Date().toISOString(),
        data: {
          email_id: randomUUID(),
          from: "Ruvon <pedidos@ruvon.store>",
          to: ["private@example.com"],
        },
      }),
    );
    const { headers, secret } = signed(raw);
    vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
    await ingestResend(
      new Request("https://ruvon.store/api/webhooks/resend", {
        method: "POST",
        headers,
        body: raw,
      }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "commerce_ingest_event",
      expect.objectContaining({
        p_data: expect.objectContaining({
          payload: {
            type: "email.delivered",
            from: null,
            notification_id: null,
            quarantine_reason: "UNMATCHED_ENVIRONMENT",
          },
        }),
      }),
    );
  });
});

it("keeps authorisation and preparation copy distinct and excludes contact/address details", () => {
  const order = {
    id: randomUUID(),
    recipient_email: "private@example.com",
    delivery_address: { street_address: ["Private street"] },
    operational_status: "awaiting_merchant",
  } as CommerceOrder;
  const pending = notificationText(
    "customer_update",
    order,
    "https://ruvon.store",
  );
  expect(pending.text).toContain("Pagamento autorizado");
  expect(pending.text).toContain("Ainda não começou");
  const ready = notificationText(
    "merchant_preparation",
    order,
    "https://ruvon.store",
  );
  expect(ready.text).toContain("Já podes preparar");
  expect(JSON.stringify([pending, ready])).not.toContain("private@example.com");
  expect(JSON.stringify([pending, ready])).not.toContain("Private street");
});
