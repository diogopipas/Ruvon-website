import { beforeAll, afterAll, it, expect, describe } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;",
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(
      (await readFile(`supabase/migrations/${file}`, "utf8")).replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
}, 20000);
afterAll(() => db.close());
async function rpc<T = Record<string, unknown>>(
  name: string,
  types: string[],
  args: unknown[],
) {
  return (
    await db.query<{ v: T }>(
      `select public.${name}(${types.map((t, i) => `$${i + 1}::${t}`).join(",")}) v`,
      args.map((a, i) => (types[i] === "jsonb" ? JSON.stringify(a) : a)),
    )
  ).rows[0].v;
}
async function fixture(stock = 100) {
  const store = randomUUID(),
    user = randomUUID();
  await db.query("insert into auth.users values($1)", [user]);
  await db.query(
    "insert into public.stores(id,name,enabled,paused,pickup_address,phone,email,opening_hours,delivery_postcodes,heartbeat_at,easypay_account_id,clearing_period,release_delay_days) values($1,'Test',true,false,'{}','+351911234567','test@example.com',$2::jsonb,array['1000-001'],now(),$3,'30D',1)",
    [
      store,
      JSON.stringify(
        Object.fromEntries(
          Array.from({ length: 7 }, (_, i) => [
            i,
            [{ start: "00:00", end: "23:59" }],
          ]),
        ),
      ),
      randomUUID(),
    ],
  );
  await db.query("insert into public.store_users values($1,$2,'staff',true)", [
    store,
    user,
  ]);
  await db.exec(
    "insert into public.catalog_skus values('gelo','Gelo','2 kg',false,false,2000,'{}',true) on conflict do nothing",
  );
  await db.query(
    "insert into public.store_products(store_id,sku,price,stock_on_hand,enabled) values($1,'gelo',100,$2,true)",
    [store, stock],
  );
  return { store, user };
}
async function quote(
  store: string,
  quantity = 1,
  key = randomUUID(),
  requiresAge = false,
) {
  const owner = "a".repeat(64),
    subtotal = 100 * quantity;
  const data = {
    owner_hash: owner,
    checkout_key: key,
    snapshot_hash: key,
    store_id: store,
    environment: "sandbox",
    delivery_address: { zip_code: "1000-001", city: "Lisboa" },
    quote_snapshot: { id: "dqt_test" },
    quote_expires_at: new Date(Date.now() + 600000).toISOString(),
    items: [
      {
        id: "gelo",
        name: "Gelo",
        quantity,
        unit_price: 100,
        line_price: subtotal,
        recipe: [{ sku: "gelo", quantity: 1 }],
        components: [{ sku: "gelo", quantity: 1, unit_price: 100 }],
      },
    ],
    subtotal,
    delivery_fee: 400,
    service_fee: 200,
    total: subtotal + 600,
    allocation: {
      commission_bps: 1000,
      merchant: subtotal * 0.9,
      ruvon: subtotal * 0.1 + 600,
    },
    contains_alcohol: requiresAge,
    requires_age_verification: requiresAge,
  };
  return await rpc<{ id: string; version: number }>(
    "commerce_create_quote",
    ["jsonb"],
    [data],
  );
}
async function start(id: string, command = randomUUID()) {
  return rpc(
    "commerce_start_order",
    ["uuid", "text", "uuid", "jsonb", "text", "text", "boolean"],
    [
      id,
      "a".repeat(64),
      command,
      { name: "Test Customer", phone: "911234567" },
      "MBW",
      randomUUID(),
      false,
    ],
  );
}
async function order(id: string) {
  return (
    await db.query<Record<string, unknown>>(
      "select * from public.payment_orders where id=$1",
      [id],
    )
  ).rows[0];
}
async function jobFor(id: string, kind = "authorise") {
  await db.query(
    "update public.background_jobs set state='running',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds' where order_id=$1 and kind=$2 returning *",
    [id, kind],
  );
  return (
    await db.query<{ id: string; lease_token: string }>(
      "select * from public.background_jobs where order_id=$1 and kind=$2 order by created_at desc limit 1",
      [id, kind],
    )
  ).rows[0];
}
async function operation(id: string, kind = "authorise") {
  const j = await jobFor(id),
    o = await order(id);
  const op = await rpc<{ id: string }>(
    "commerce_prepare_operation",
    ["jsonb", "uuid", "uuid"],
    [
      {
        provider: kind.startsWith("delivery_") ? "uber" : "easypay",
        account: "test",
        kind,
        order_id: id,
        attempt_id: o.current_attempt_id,
        logical_key: `${kind}:${id}`,
        idempotency_key: randomUUID(),
        request: {},
        request_hash: "hash",
      },
      j.id,
      j.lease_token,
    ],
  );
  return { op, j };
}
async function authorised(id: string) {
  const { op, j } = await operation(id);
  await rpc(
    "commerce_apply_operation",
    ["uuid", "uuid", "uuid", "jsonb"],
    [
      op.id,
      j.id,
      j.lease_token,
      {
        state: "succeeded",
        resource_id: randomUUID(),
        amount: (await order(id)).total,
      },
    ],
  );
}
async function booked(requiresAge = false) {
  const { store, user } = await fixture(),
    q = await quote(store, 1, randomUUID(), requiresAge);
  await start(q.id);
  await authorised(q.id);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await rpc(
    "merchant_command",
    ["uuid", "uuid", "int", "text"],
    [q.id, randomUUID(), (await order(q.id)).version, "accept"],
  );
  const capture = await operation(q.id, "capture");
  await rpc(
    "commerce_apply_operation",
    ["uuid", "uuid", "uuid", "jsonb"],
    [
      capture.op.id,
      capture.j.id,
      capture.j.lease_token,
      {
        state: "succeeded",
        resource_id: randomUUID(),
        amount: 700,
        splits: [
          {
            id: randomUUID(),
            account_id: randomUUID(),
            beneficiary: "merchant",
            amount: 90,
            clearing_date: "2026-12-01",
          },
          {
            id: randomUUID(),
            account_id: randomUUID(),
            beneficiary: "ruvon",
            amount: 610,
            clearing_date: "2026-12-01",
          },
        ],
      },
    ],
  );
  const booking = await operation(q.id, "delivery_create"),
    deliveryId = `del_${randomUUID()}`;
  await rpc(
    "commerce_apply_operation",
    ["uuid", "uuid", "uuid", "jsonb"],
    [
      booking.op.id,
      booking.j.id,
      booking.j.lease_token,
      {
        state: "succeeded",
        resource_id: deliveryId,
        status: "pending",
        cost: 400,
        quote_id: "dqt_test",
      },
    ],
  );
  const delivery = (status: string, extra: Record<string, unknown> = {}) =>
    rpc(
      "commerce_apply_delivery",
      ["uuid", "jsonb", "uuid", "uuid"],
      [
        q.id,
        { id: deliveryId, status, ...extra },
        booking.j.id,
        booking.j.lease_token,
      ],
    );
  return { store, user, q, booking, deliveryId, delivery };
}
describe("guarded commerce transactions", () => {
  it("resolves a reviewed case through a named, versioned command without minting financial keys", async () => {
    const { q, user } = await booked();
    const cid = await rpc(
      "commerce_open_case",
      ["uuid", "text", "text", "text"],
      [q.id, `case:${q.id}`, "delivery", "MERCHANT_DELAY"],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec(
      `select set_config('request.jwt.claims','{"app_metadata":{"role":"operations_admin"}}',false)`,
    );
    const args = [
      q.id,
      randomUUID(),
      (await order(q.id)).version,
      cid,
      {
        action: "resume",
        responsible_party: "unknown",
        summary: "Provider state checked; store can prepare",
      },
      "Provider state checked; store can prepare",
    ];
    const first = await rpc(
      "operations_resolve_case",
      ["uuid", "uuid", "int", "uuid", "jsonb", "text"],
      args,
    );
    expect(
      await rpc(
        "operations_resolve_case",
        ["uuid", "uuid", "int", "uuid", "jsonb", "text"],
        args,
      ),
    ).toEqual(first);
    expect((await order(q.id)).operational_status).toBe("preparing");
    expect((await order(q.id)).review_reason).toBeNull();
    expect(
      (
        await db.query(
          "select * from public.provider_operations where order_id=$1 and kind='capture'",
          [q.id],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select * from public.provider_operations where order_id=$1 and kind='delivery_create'",
          [q.id],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("refuses case recovery while a dispatched financial operation is unknown", async () => {
    const { store, user } = await fixture(),
      q = await quote(store);
    await start(q.id);
    const { op, j } = await operation(q.id);
    await rpc(
      "commerce_dispatch_operation",
      ["uuid", "uuid", "uuid"],
      [op.id, j.id, j.lease_token],
    );
    const cid = await rpc(
      "commerce_open_case",
      ["uuid", "text", "text", "text"],
      [q.id, `unknown:${q.id}`, "payment", "PAYMENT_UNCERTAIN"],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec(
      `select set_config('request.jwt.claims','{"app_metadata":{"role":"operations_admin"}}',false)`,
    );
    await expect(
      rpc(
        "operations_resolve_case",
        ["uuid", "uuid", "int", "uuid", "jsonb", "text"],
        [
          q.id,
          randomUUID(),
          (await order(q.id)).version,
          cid,
          {
            action: "resume",
            responsible_party: "unknown",
            summary: "Attempt to resume",
          },
          "Attempt to resume",
        ],
      ),
    ).rejects.toThrow("Unresolved facts");
    expect(
      (
        await db.query("select state from public.order_cases where id=$1", [
          cid,
        ])
      ).rows[0],
    ).toEqual({ state: "open" });
    expect((await order(q.id)).operational_status).toBe("manual_review");
  });
  it("records pickup and delivery once, consumes stock and blocks contradictory regressions", async () => {
    const { store, q, delivery } = await booked();
    expect((await order(q.id)).operational_status).toBe("preparing");
    await delivery("pickup_complete");
    await delivery("pickup_complete");
    expect((await order(q.id)).operational_status).toBe("in_delivery");
    expect(
      (
        await db.query(
          "select stock_on_hand,reserved_quantity from public.store_products where store_id=$1",
          [store],
        )
      ).rows[0],
    ).toEqual({ stock_on_hand: 99, reserved_quantity: 0 });
    await delivery("delivered");
    await delivery("delivered");
    expect((await order(q.id)).operational_status).toBe("delivered");
    expect(
      (
        await db.query(
          "select * from public.background_jobs where order_id=$1 and kind='schedule_clearing'",
          [q.id],
        )
      ).rows,
    ).toHaveLength(1);
    await delivery("pickup");
    expect((await order(q.id)).operational_status).toBe("manual_review");
    expect(
      (
        await db.query(
          "select status from public.deliveries where order_id=$1",
          [q.id],
        )
      ).rows[0],
    ).toEqual({ status: "delivered" });
  });
  it("holds alcohol clearing without identification outcome and fences delivery reads", async () => {
    const { q, delivery, booking } = await booked(true);
    await delivery("delivered");
    expect((await order(q.id)).review_reason).toBe(
      "AGE_VERIFICATION_EVIDENCE_MISSING",
    );
    expect(
      (
        await db.query(
          "select * from public.background_jobs where order_id=$1 and kind='schedule_clearing'",
          [q.id],
        )
      ).rows,
    ).toHaveLength(0);
    await db.query(
      "update public.background_jobs set lease_expires_at=now()-interval '1 second' where id=$1",
      [booking.j.id],
    );
    await expect(
      delivery("delivered", { verification_passed: true }),
    ).rejects.toThrow("Lease lost");
  });
  it("keeps return legs separate and restocks only explicitly confirmed saleable goods once", async () => {
    const { store, user, q, delivery, deliveryId, booking } = await booked();
    const returnedId = `ret_${randomUUID()}`;
    await delivery("pickup_complete");
    await delivery("canceled", { return_id: returnedId });
    expect((await order(q.id)).operational_status).toBe("returning");
    await rpc(
      "commerce_apply_delivery",
      ["uuid", "jsonb", "uuid", "uuid"],
      [
        q.id,
        { id: returnedId, parent_id: deliveryId, status: "delivered" },
        booking.j.id,
        booking.j.lease_token,
      ],
    );
    expect((await order(q.id)).operational_status).toBe("returned");
    expect(
      (
        await db.query(
          "select * from public.background_jobs where order_id=$1 and kind='schedule_clearing'",
          [q.id],
        )
      ).rows,
    ).toHaveLength(0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    const command = randomUUID(),
      version = (await order(q.id)).version;
    const args = [
      q.id,
      command,
      version,
      "return_received",
      "Sealed and saleable",
      null,
      { gelo: 1 },
    ];
    await rpc(
      "merchant_command",
      ["uuid", "uuid", "int", "text", "text", "text", "jsonb"],
      args,
    );
    await rpc(
      "merchant_command",
      ["uuid", "uuid", "int", "text", "text", "text", "jsonb"],
      args,
    );
    expect(
      (
        await db.query(
          "select stock_on_hand from public.store_products where store_id=$1",
          [store],
        )
      ).rows[0],
    ).toEqual({ stock_on_hand: 100 });
    await expect(
      rpc(
        "merchant_command",
        ["uuid", "uuid", "int", "text", "text", "text", "jsonb"],
        [
          q.id,
          randomUUID(),
          (await order(q.id)).version,
          "return_received",
          "Duplicate receipt",
          null,
          { gelo: 1 },
        ],
      ),
    ).rejects.toThrow("Invalid return quantity");
  });
  it("creates one snapshot, reserves once and replays the same command", async () => {
    const { store } = await fixture(),
      q = await quote(store),
      key = randomUUID();
    const first = await start(q.id, key),
      second = await start(q.id, key);
    expect(second).toEqual(first);
    expect(
      (
        await db.query(
          "select * from public.payment_attempts where order_id=$1",
          [q.id],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select reserved_quantity from public.store_products where store_id=$1",
          [store],
        )
      ).rows[0],
    ).toEqual({ reserved_quantity: 1 });
    await expect(
      db.query(
        "update public.payment_orders set subtotal=subtotal+1,total=total+1 where id=$1",
        [q.id],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "update public.order_items set name='changed' where order_id=$1",
        [q.id],
      ),
    ).rejects.toThrow("Immutable");
  });
  it("rolls back a competing reservation when shared stock is exhausted", async () => {
    const { store } = await fixture(2),
      a = await quote(store, 2),
      b = await quote(store, 1);
    const outcomes = await Promise.allSettled([start(a.id), start(b.id)]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await db.query(
          "select count(*)::int n from public.payment_attempts where order_id in ($1,$2)",
          [a.id, b.id],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    expect(
      (
        await db.query(
          "select reserved_quantity from public.store_products where store_id=$1",
          [store],
        )
      ).rows[0],
    ).toEqual({ reserved_quantity: 2 });
  });
  it("checks membership, versions and the database acceptance deadline", async () => {
    const { store, user } = await fixture(),
      q = await quote(store);
    await start(q.id);
    await authorised(q.id);
    const o = await order(q.id);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      randomUUID(),
    ]);
    await expect(
      rpc(
        "merchant_command",
        ["uuid", "uuid", "int", "text"],
        [q.id, randomUUID(), o.version, "accept"],
      ),
    ).rejects.toThrow("Forbidden");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await expect(
      rpc(
        "merchant_command",
        ["uuid", "uuid", "int", "text"],
        [q.id, randomUUID(), 0, "accept"],
      ),
    ).rejects.toThrow("Stale");
    const key = randomUUID();
    const accepted = await rpc(
      "merchant_command",
      ["uuid", "uuid", "int", "text"],
      [q.id, key, o.version, "accept"],
    );
    expect(
      await rpc(
        "merchant_command",
        ["uuid", "uuid", "int", "text"],
        [q.id, key, o.version, "accept"],
      ),
    ).toEqual(accepted);
    expect((await order(q.id)).operational_status).toBe("confirming");
    await expect(
      rpc(
        "merchant_command",
        ["uuid", "uuid", "int", "text", "text", "text"],
        [q.id, randomUUID(), Number(o.version) + 1, "ready", null, "seal"],
      ),
    ).rejects.toThrow("Preparation");
    const late = await quote(store);
    await start(late.id);
    await authorised(late.id);
    await db.exec("select set_config('ruvon.command','on',false)");
    await db.query(
      "update public.payment_orders set acceptance_deadline=now()-interval '1 second' where id=$1",
      [late.id],
    );
    await db.exec("select set_config('ruvon.command','off',false)");
    await expect(
      rpc(
        "merchant_command",
        ["uuid", "uuid", "int", "text"],
        [late.id, randomUUID(), (await order(late.id)).version, "accept"],
      ),
    ).rejects.toThrow("Acceptance closed");
    await rpc(
      "commerce_deadline",
      ["uuid", "text"],
      [late.id, "merchant_timeout"],
    );
    expect((await order(late.id)).operational_status).toBe("cancelling");
  });
  it("cancels before dispatch without leaving reserved stock or authorising later", async () => {
    const { store } = await fixture(),
      q = await quote(store);
    await start(q.id);
    const o = await order(q.id);
    await rpc(
      "commerce_customer_command",
      ["uuid", "text", "uuid", "int", "text", "text"],
      [
        q.id,
        "a".repeat(64),
        randomUUID(),
        o.version,
        "cancel",
        "CUSTOMER_CANCELLED",
      ],
    );
    expect(await rpc("commerce_close_cancellation", ["uuid"], [q.id])).toBe(
      true,
    );
    expect((await order(q.id)).operational_status).toBe("cancelled");
    expect(
      (
        await db.query(
          "select reserved_quantity from public.store_products where store_id=$1",
          [store],
        )
      ).rows[0],
    ).toEqual({ reserved_quantity: 0 });
  });
  it("dispatches a mutation once and fences a worker that lost its lease", async () => {
    const { store } = await fixture(),
      q = await quote(store);
    await start(q.id);
    const { op, j } = await operation(q.id);
    expect(
      await rpc(
        "commerce_dispatch_operation",
        ["uuid", "uuid", "uuid"],
        [op.id, j.id, j.lease_token],
      ),
    ).toBe(true);
    expect(
      await rpc(
        "commerce_dispatch_operation",
        ["uuid", "uuid", "uuid"],
        [op.id, j.id, j.lease_token],
      ),
    ).toBe(false);
    await db.query(
      "update public.background_jobs set lease_expires_at=now()-interval '1 second' where id=$1",
      [j.id],
    );
    await expect(
      rpc(
        "commerce_apply_operation",
        ["uuid", "uuid", "uuid", "jsonb"],
        [
          op.id,
          j.id,
          j.lease_token,
          { state: "succeeded", resource_id: randomUUID(), amount: 700 },
        ],
      ),
    ).rejects.toThrow("Lease lost");
    expect(
      await rpc("commerce_finish_job", ["uuid", "uuid"], [j.id, j.lease_token]),
    ).toBe(false);
  });
  it("does not deduplicate distinct Easypay states by resource ID alone", async () => {
    const resource = randomUUID(),
      base = {
        provider: "easypay",
        account: "test",
        environment: "sandbox",
        resource_id: resource,
        payload_hash: "hash",
        payload: {},
      };
    const a = await rpc(
      "commerce_ingest_event",
      ["jsonb"],
      [{ ...base, event_identity: "fingerprint-a" }],
    );
    expect(
      await rpc(
        "commerce_ingest_event",
        ["jsonb"],
        [{ ...base, event_identity: "fingerprint-a" }],
      ),
    ).toBe(a);
    expect(
      await rpc(
        "commerce_ingest_event",
        ["jsonb"],
        [{ ...base, event_identity: "fingerprint-b" }],
      ),
    ).not.toBe(a);
  });
  it("denies raw merchant reads and all anonymous orchestration writes", async () => {
    await db.exec("set role authenticated");
    try {
      await expect(
        db.query("select * from public.provider_operations"),
      ).rejects.toThrow();
      await expect(
        db.query("select * from public.payment_orders"),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
    await db.exec("set role anon");
    try {
      await expect(
        db.query("select public.commerce_claim_jobs(10)"),
      ).rejects.toThrow();
      await expect(
        db.query(
          "select public.commerce_open_case(gen_random_uuid(),'key','type','reason')",
        ),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
  it("captures once, preserves paid history and serializes concurrent partial refunds", async () => {
    const { store, user } = await fixture(),
      q = await quote(store, 10);
    await start(q.id);
    await authorised(q.id);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await rpc(
      "merchant_command",
      ["uuid", "uuid", "int", "text"],
      [q.id, randomUUID(), (await order(q.id)).version, "accept"],
    );
    const { op, j } = await operation(q.id, "capture");
    const captureId = randomUUID();
    const o = await order(q.id);
    const fact = {
      state: "succeeded",
      resource_id: captureId,
      amount: o.total,
      splits: [
        {
          id: randomUUID(),
          account_id: randomUUID(),
          beneficiary: "merchant",
          amount: 900,
          clearing_date: "2026-12-01",
        },
        {
          id: randomUUID(),
          account_id: randomUUID(),
          beneficiary: "ruvon",
          amount: 700,
          clearing_date: "2026-12-01",
        },
      ],
    };
    await rpc(
      "commerce_apply_operation",
      ["uuid", "uuid", "uuid", "jsonb"],
      [op.id, j.id, j.lease_token, fact],
    );
    await rpc(
      "commerce_apply_operation",
      ["uuid", "uuid", "uuid", "jsonb"],
      [op.id, j.id, j.lease_token, fact],
    );
    expect(
      (
        await db.query(
          "select * from public.payment_splits where order_id=$1",
          [q.id],
        )
      ).rows,
    ).toHaveLength(2);
    const reserve = (amount: number, products: number, key = randomUUID()) =>
      rpc(
        "commerce_refund_reserve",
        ["uuid", "uuid", "int", "jsonb", "text", "text", "text"],
        [
          q.id,
          key,
          amount,
          { products, service: 0, delivery: 0 },
          "MISSING_ITEM",
          user,
          "unknown",
        ],
      );
    const results = await Promise.allSettled([
      reserve(800, 800),
      reserve(800, 800),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(reserve(300, 300)).rejects.toThrow("component balance");
    expect((await order(q.id)).payment_status).toBe("paid");
    expect((await order(q.id)).state).toBe("paid");
    await expect(
      db.query(
        "update public.provider_operations set request='{}',request_hash='changed' where id=$1",
        [op.id],
      ),
    ).rejects.toThrow("immutable");
  });
  it("blocks an unstarted capture after a customer review request, while allowing reconciliation", async () => {
    const { store, user } = await fixture(),
      q = await quote(store);
    await start(q.id);
    await authorised(q.id);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await rpc(
      "merchant_command",
      ["uuid", "uuid", "int", "text"],
      [q.id, randomUUID(), (await order(q.id)).version, "accept"],
    );
    const { op, j } = await operation(q.id, "capture"),
      o = await order(q.id);
    await rpc(
      "commerce_customer_command",
      ["uuid", "text", "uuid", "int", "text", "text"],
      [
        q.id,
        "a".repeat(64),
        randomUUID(),
        o.version,
        "cancel",
        "CUSTOMER_CHANGED_MIND",
      ],
    );
    await expect(
      rpc(
        "commerce_dispatch_operation",
        ["uuid", "uuid", "uuid"],
        [op.id, j.id, j.lease_token],
      ),
    ).rejects.toThrow("Capture prohibited");
    expect((await order(q.id)).operational_status).toBe("manual_review");
  });
  it("requires a named operations role before accepting financial commands", async () => {
    const { store, user } = await fixture(),
      q = await quote(store);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("select set_config('request.jwt.claims','{}',false)");
    await expect(
      rpc(
        "operations_command",
        ["uuid", "uuid", "int", "text", "text"],
        [q.id, randomUUID(), 0, "cancel", "Operator cancellation"],
      ),
    ).rejects.toThrow("Named administrator");
    await db.exec(
      `select set_config('request.jwt.claims','{"app_metadata":{"role":"operations_admin"}}',false)`,
    );
    await rpc(
      "operations_command",
      ["uuid", "uuid", "int", "text", "text"],
      [q.id, randomUUID(), 0, "cancel", "Operator cancellation"],
    );
    expect((await order(q.id)).operational_status).toBe("cancelling");
  });
});
