import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import type { CommerceOrder } from "@/lib/commerce";
import type { Job } from "@/lib/server/payments/service";
import { withProviderDeadline } from "@/lib/server/payments/http";
vi.mock("server-only", () => ({}));
const { rpc, query } = vi.hoisted(() => ({ rpc: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/server/orders/repository", () => ({
  orderRepository: () => ({
    rpc,
    db: {
      from: () => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          single: query,
          maybeSingle: query,
        };
        return chain;
      },
    },
  }),
}));
import {
  readSms,
  sendSms,
  smsCallback,
  smsFact,
  smsSendingConfig,
  type SmsRequest,
} from "@/lib/server/notifications/twilio";
import {
  sendSmsNotification,
  smsText,
  type SmsNotification,
} from "@/lib/server/notifications/sms-service";
import {
  ingestTwilio,
  verifyTwilioSignature,
} from "@/lib/server/notifications/twilio-webhook";

const account = `AC${"a".repeat(32)}`,
  sid = `SM${"b".repeat(32)}`;
const token = "synthetic-twilio-token-not-a-real-secret";
const from = "+15005550006",
  to = "+351911234567";
function frozen(id: string = randomUUID()): SmsRequest {
  return {
    account,
    from,
    service: null,
    to: [to],
    text: "Ruvon: teste sintético. Abrir painel autenticado.",
    callback: smsCallback(id),
  };
}
function message(request: SmsRequest) {
  return {
    sid,
    account_sid: account,
    from,
    to,
    body: request.text,
    messaging_service_sid: null,
    status: "queued",
    direction: "outbound-api",
    error_code: null,
  };
}
function notification(id = randomUUID()): SmsNotification {
  return {
    id,
    order_id: randomUUID(),
    environment: "sandbox",
    status: "pending",
    request: null,
    provider_id: null,
    first_dispatch_at: null,
  };
}
function callback(n: SmsNotification, changes: Record<string, string> = {}) {
  const params = {
    AccountSid: account,
    MessageSid: sid,
    MessageStatus: "delivered",
    From: from,
    To: to,
    ...changes,
  };
  const url = n.request!.callback;
  const signature = createHmac("sha1", token)
    .update(
      url +
        Object.keys(params)
          .sort()
          .map((k) => k + params[k as keyof typeof params])
          .join(""),
    )
    .digest("base64");
  return {
    url,
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=utf-8",
      "x-twilio-signature": signature,
    },
    body: new URLSearchParams(params).toString(),
  };
}
beforeEach(() => {
  rpc.mockReset();
  query.mockReset();
  vi.stubEnv("TWILIO_ACCOUNT_SID", account);
  vi.stubEnv("TWILIO_AUTH_TOKEN", token);
  vi.stubEnv("TWILIO_FROM_NUMBER", from);
  vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "");
  vi.stubEnv("RUVON_SMS_ENABLED", "false");
  vi.stubEnv(
    "TWILIO_STATUS_CALLBACK_URL",
    "https://ruvon.store/api/webhooks/twilio",
  );
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ruvon.store");
  vi.stubEnv("RUVON_OPERATOR_MOBILE", to);
  vi.stubEnv("RUVON_PAYMENTS_MODE", "sandbox");
  vi.stubEnv("VERCEL_ENV", "preview");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Twilio operational contract", () => {
  it("defaults sending off and blocks custom messages on a Trial account even when enabled", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ sid: account, type: "Trial", status: "active" }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(smsSendingConfig()).rejects.toMatchObject({
      classification: "sms_disabled",
    });
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("RUVON_SMS_ENABLED", "true");
    await expect(smsSendingConfig()).rejects.toMatchObject({
      classification: "sms_custom_content_requires_active_full_account",
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1].method).toBe("GET");
  });
  it("sends only the frozen form to the fixed account endpoint and makes no replay guarantee", async () => {
    const request = frozen();
    const fetcher = vi.fn().mockResolvedValue(Response.json(message(request)));
    vi.stubGlobal("fetch", fetcher);
    expect(await sendSms(request)).toMatchObject({
      id: sid,
      account,
      status: "queued",
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${account}/Messages.json`,
    );
    expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({
      To: to,
      From: from,
      Body: request.text,
      StatusCallback: request.callback,
    });
    expect(init.headers["Idempotency-Key"]).toBeUndefined();
    expect(init.redirect).toBe("error");
  });
  it("supports a configured service and verifies it when reading a message", async () => {
    const service = `MG${"c".repeat(32)}`,
      request = { ...frozen(), from: null, service };
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ...message(request), messaging_service_sid: service }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await readSms(sid, request)).toMatchObject({ id: sid, service });
    expect(fetcher.mock.calls[0][1].method).toBe("GET");
    expect(
      smsFact(
        {
          ...message(request),
          from: null,
          status: "accepted",
          messaging_service_sid: service,
        },
        request,
      ),
    ).toMatchObject({ id: sid, from: null, service, status: "accepted" });
    expect(() =>
      smsFact(
        { ...message(request), messaging_service_sid: `MG${"d".repeat(32)}` },
        request,
      ),
    ).toThrow("sms_identity_conflict");
  });
  it("rejects foreign accounts, recipients, content, sender, inbound messages and unknown IDs", async () => {
    const request = frozen();
    for (const fields of [
      { account_sid: `AC${"e".repeat(32)}` },
      { to: "+351922222222" },
      { body: "different content" },
      { from: "+15005550007" },
      { from: null },
      { direction: "inbound" },
      { sid: "untrusted-id" },
    ])
      expect(() =>
        smsFact({ ...message(request), ...fields }, request),
      ).toThrow();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(readSms("https://attacker.invalid", request)).rejects.toThrow(
      "sms_identity_conflict",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps callback origin/path fixed and rejects ambiguous sender configuration", async () => {
    vi.stubEnv(
      "TWILIO_STATUS_CALLBACK_URL",
      "https://attacker.invalid/api/webhooks/twilio",
    );
    expect(() => frozen()).toThrow("invalid_sms_callback");
    vi.stubEnv(
      "TWILIO_STATUS_CALLBACK_URL",
      "https://ruvon.store/api/webhooks/twilio?notification_id=other",
    );
    expect(() => frozen()).toThrow("invalid_sms_callback");
    vi.stubEnv("RUVON_SMS_ENABLED", "true");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", `MG${"c".repeat(32)}`);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ sid: account, type: "Full", status: "active" }),
        ),
    );
    await expect(smsSendingConfig()).rejects.toThrow("invalid_sms_sender");
  });
  it("does not dispatch a persisted uncertain SMS again, and records transport loss after one grant", async () => {
    const n = notification(),
      order = { id: n.order_id, environment: "sandbox" } as CommerceOrder;
    const job = {
      id: randomUUID(),
      kind: "operator_alert",
      lease_token: randomUUID(),
    } as Job;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ sid: account, type: "Full", status: "active" }),
      )
      .mockRejectedValueOnce(new Error("private payload"));
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("RUVON_SMS_ENABLED", "true");
    rpc.mockImplementation(async (name, args) =>
      name === "commerce_dispatch_notification"
        ? { allowed: true, request: args.p_request }
        : null,
    );
    await expect(sendSmsNotification(job, order, n)).rejects.toMatchObject({
      classification: "transport_unknown",
    });
    expect(rpc).toHaveBeenCalledWith(
      "commerce_finish_notification",
      expect.objectContaining({
        p_error: "transport_unknown",
        p_definitive: false,
      }),
    );
    await sendSmsNotification(job, order, {
      ...n,
      status: "unknown",
      first_dispatch_at: new Date().toISOString(),
    });
    expect(
      fetcher.mock.calls.filter(([, init]) => init.method === "POST"),
    ).toHaveLength(1);
  });
});

it("defers before obtaining a dispatch grant when the worker cannot fund the remaining request time", async () => {
  const n = notification(),
    order = { id: n.order_id, environment: "sandbox" } as CommerceOrder;
  const job = {
    id: randomUUID(),
    kind: "operator_alert",
    lease_token: randomUUID(),
  } as Job;
  vi.stubEnv("RUVON_SMS_ENABLED", "true");
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ sid: account, type: "Full", status: "active" }),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    withProviderDeadline(Date.now() + 1000, () =>
      sendSmsNotification(job, order, n),
    ),
  ).rejects.toMatchObject({ classification: "worker_budget_expired" });
  expect(rpc).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.every(([, init]) => init.method === "GET")).toBe(
    true,
  );
});

describe("signed SMS inbox", () => {
  it("matches the published Twilio signature vector and checks all decoded parameters", () => {
    const url = "https://example.com/myapp.php?foo=1&bar=2";
    const params = {
      CallSid: "CA1234567890ABCDE",
      Caller: "+14158675310",
      Digits: "1234",
      From: "+14158675310",
      To: "+18005551212",
    };
    expect(
      verifyTwilioSignature(
        url,
        params,
        "L/OH5YylLD5NRKLltdqwSvS0BnU=",
        "12345",
      ),
    ).toBe(true);
    expect(
      verifyTwilioSignature(
        url + "&extra=1",
        params,
        "L/OH5YylLD5NRKLltdqwSvS0BnU=",
        "12345",
      ),
    ).toBe(false);
    expect(
      verifyTwilioSignature(
        url,
        { ...params, Extra: "ação 🍋" },
        "L/OH5YylLD5NRKLltdqwSvS0BnU=",
        "12345",
      ),
    ).toBe(false);
  });
  it("ingests signed callbacks while sending is disabled, retaining only references and a payload hash", async () => {
    const n = notification();
    n.first_dispatch_at = new Date().toISOString();
    n.request = frozen(n.id);
    query.mockResolvedValue({ data: n, error: null });
    rpc.mockResolvedValue(randomUUID());
    vi.stubEnv("TWILIO_STATUS_CALLBACK_URL", "");
    const c = callback(n, {
      Body: "private content ação 🍋",
      ExtraFutureParameter: "supported in signature",
    });
    await ingestTwilio(
      new Request(c.url, { method: "POST", headers: c.headers, body: c.body }),
    );
    const stored = rpc.mock.calls[0][1].p_data;
    expect(stored).toMatchObject({
      provider: "twilio",
      account,
      environment: "sandbox",
      resource_id: sid,
      payload: { notification_id: n.id, quarantine_reason: null },
    });
    expect(JSON.stringify(stored)).not.toContain(to);
    expect(JSON.stringify(stored)).not.toContain("private");
    expect(JSON.stringify(stored)).not.toContain("Body");
    const oldIdentity = stored.event_identity;
    await ingestTwilio(
      new Request(c.url, { method: "POST", headers: c.headers, body: c.body }),
    );
    expect(rpc.mock.calls[1][1].p_data.event_identity).toBe(oldIdentity);
  });
  it("rejects changed URL/body, duplicate form fields, invalid signatures and oversized inputs", async () => {
    const n = notification();
    n.request = frozen(n.id);
    n.first_dispatch_at = new Date().toISOString();
    query.mockResolvedValue({ data: n, error: null });
    const c = callback(n);
    await expect(
      ingestTwilio(
        new Request(c.url + "&extra=1", {
          method: "POST",
          headers: c.headers,
          body: c.body,
        }),
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      ingestTwilio(
        new Request(c.url, {
          method: "POST",
          headers: c.headers,
          body: c.body.replace("delivered", "failed"),
        }),
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      ingestTwilio(
        new Request(c.url, {
          method: "POST",
          headers: c.headers,
          body: c.body + "&To=other",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      ingestTwilio(
        new Request(c.url, {
          method: "POST",
          headers: c.headers,
          body: "x".repeat(16001),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
    expect(rpc).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
  it("quarantines authenticated cross-environment or mismatched references without retaining PII", async () => {
    const n = notification();
    n.request = frozen(n.id);
    n.first_dispatch_at = new Date().toISOString();
    n.environment = "live";
    query.mockResolvedValue({ data: n, error: null });
    const c = callback(n);
    await ingestTwilio(
      new Request(c.url, { method: "POST", headers: c.headers, body: c.body }),
    );
    expect(rpc.mock.calls[0][1].p_data.payload.quarantine_reason).toBe(
      "UNMATCHED_ENVIRONMENT",
    );
  });
});
it("uses actionable staff links without customer contact/address content", () => {
  const order = {
    id: randomUUID(),
    environment: "sandbox",
    recipient_name: "Private Name",
    recipient_phone: "+351999999999",
    delivery_address: { street_address: ["Private Street"] },
  } as CommerceOrder;
  const text = smsText("merchant_notify", order, "https://ruvon.store");
  expect(text).toContain("/merchant");
  expect(text).toContain("Aguarda autorizacao");
  expect(text).not.toContain("Private");
  expect(text).not.toContain("999999999");
});
