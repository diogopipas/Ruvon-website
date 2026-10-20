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
  quoteDetails: Record<string, unknown> = {},
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
    quote_snapshot: { id: "dqt_test", ...quoteDetails },
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
async function start(
  id: string,
  command = randomUUID(),
  contact: { name: string; phone: string; email?: string } = {
    name: "Test Customer",
    phone: "911234567",
  },
) {
  return rpc(
    "commerce_start_order",
    ["uuid", "text", "uuid", "jsonb", "text", "text", "boolean"],
    [id, "a".repeat(64), command, contact, "MBW", randomUUID(), false],
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
async function booked(
  requiresAge = false,
  email?: string,
  quoteDetails: Record<string, unknown> = {},
) {
  const { store, user } = await fixture(),
    q = await quote(store, 1, randomUUID(), requiresAge, quoteDetails);
  await start(q.id, randomUUID(), {
    name: "Test Customer",
    phone: "911234567",
    ...(email ? { email } : {}),
  });
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
        ["uuid", "uuid", "int", "text", "text"],
        [q.id, key, o.version, "accept", "Changed replay content"],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    const colleague = randomUUID();
    await db.query("insert into auth.users values($1)", [colleague]);
    await db.query(
      "insert into public.store_users values($1,$2,'staff',true)",
      [store, colleague],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      colleague,
    ]);
    await expect(
      rpc(
        "merchant_command",
        ["uuid", "uuid", "int", "text"],
        [q.id, key, o.version, "accept"],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.order_events where command_key=$1",
          [key],
        )
      ).rows[0].n,
    ).toBe(1);
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
  it("replays an approved partial refund as one audited intent and rejects changed allocations or actors", async () => {
    const { q, user } = await booked();
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec(
      `select set_config('request.jwt.claims','{"app_metadata":{"role":"operations_admin"}}',false)`,
    );
    const key = randomUUID(),
      version = (await order(q.id)).version;
    const send = (
      actorAllocation = { products: 50, service: 0, delivery: 0 },
    ) =>
      rpc(
        "operations_command",
        ["uuid", "uuid", "int", "text", "text", "uuid", "int", "jsonb"],
        [
          q.id,
          key,
          version,
          "refund",
          "Missing product",
          null,
          50,
          actorAllocation,
        ],
      );
    const first = await send();
    expect(await send()).toEqual(first);
    await expect(
      send({ products: 49, service: 1, delivery: 0 }),
    ).rejects.toMatchObject({ code: "23505" });
    const other = randomUUID();
    await db.query("insert into auth.users values($1)", [other]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    await expect(send()).rejects.toMatchObject({ code: "23505" });
    expect(
      (
        await db.query(
          "select amount,allocation from public.refunds where id=$1",
          [key],
        )
      ).rows,
    ).toEqual([
      { amount: 50, allocation: { products: 50, service: 0, delivery: 0 } },
    ]);
    expect(
      (
        await db.query(
          "select id from public.background_jobs where job_key=$1",
          [`refund:${key}`],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select id from public.order_events where command_key=$1",
          [key],
        )
      ).rows,
    ).toHaveLength(1);
  });
});

describe("database deadlines and reconstruction", () => {
  const deadline = (id: string, kind: string) =>
    rpc("commerce_deadline", ["uuid", "text"], [id, kind]);
  async function cases(id: string) {
    return (
      await db.query<{ reason: string }>(
        "select reason from public.order_cases where order_id=$1 order by created_at",
        [id],
      )
    ).rows.map((row) => row.reason);
  }
  async function policy(
    id: string,
    kind: string,
    deliveryId: string,
    status: string,
  ) {
    await rpc("commerce_sweep", [], []);
    const j = await jobFor(id, kind);
    await rpc(
      "commerce_delivery_deadline",
      ["uuid", "uuid", "text", "text"],
      [j.id, j.lease_token, deliveryId, status],
    );
    return j;
  }
  it("rejects unsupported deadlines and records no event or hold for an early preparation deadline", async () => {
    const { q } = await booked();
    await deadline(q.id, "preparation_overdue");
    expect((await order(q.id)).operational_status).toBe("preparing");
    expect(await cases(q.id)).toEqual([]);
    expect(
      (
        await db.query(
          "select id from public.order_events where command_key=$1",
          [`deadline:preparation_overdue:${q.id}`],
        )
      ).rows,
    ).toEqual([]);
    await expect(deadline(q.id, "invented")).rejects.toMatchObject({
      code: "22023",
    });
    await db.query(
      "update public.deliveries set created_at=now()-interval '21 minutes' where order_id=$1",
      [q.id],
    );
    await deadline(q.id, "preparation_overdue");
    await deadline(q.id, "preparation_overdue");
    expect((await order(q.id)).operational_status).toBe("manual_review");
    expect(await cases(q.id)).toEqual(["MERCHANT_DELAY"]);
  });
  it("cannot time out merchant acceptance before the database deadline", async () => {
    const { store } = await fixture(),
      q = await quote(store);
    await start(q.id);
    await authorised(q.id);
    await deadline(q.id, "merchant_timeout");
    expect((await order(q.id)).operational_status).toBe("awaiting_merchant");
    expect(
      (
        await db.query(
          "select id from public.order_events where command_key=$1",
          [`deadline:merchant_timeout:${q.id}`],
        )
      ).rows,
    ).toEqual([]);
  });
  it("checks the ten-minute courier threshold, holds clearing once and preserves payment and stock", async () => {
    const { q, deliveryId } = await booked();
    await policy(q.id, "courier_check", deliveryId, "pending");
    expect(await cases(q.id)).toEqual([]);
    await db.query(
      "update public.deliveries set created_at=now()-interval '11 minutes' where order_id=$1",
      [q.id],
    );
    const j = await policy(q.id, "courier_check", deliveryId, "pending");
    await rpc(
      "commerce_delivery_deadline",
      ["uuid", "uuid", "text", "text"],
      [j.id, j.lease_token, deliveryId, "pending"],
    );
    expect(await cases(q.id)).toEqual(["NO_COURIER_ASSIGNED"]);
    expect(await order(q.id)).toMatchObject({
      operational_status: "manual_review",
      payment_status: "paid",
      settlement_status: "disputed",
    });
    expect(
      (
        await db.query(
          "select status from public.deliveries where order_id=$1",
          [q.id],
        )
      ).rows,
    ).toEqual([{ status: "pending" }]);
    expect(
      (
        await db.query(
          "select status from public.inventory_reservations where order_id=$1",
          [q.id],
        )
      ).rows,
    ).toEqual([{ status: "reserved" }]);
    expect(
      (
        await db.query("select id from public.refunds where order_id=$1", [
          q.id,
        ])
      ).rows,
    ).toEqual([]);
  });
  it("does not mistake an assigned courier, a newer pickup or a lost lease for a cancellation opportunity", async () => {
    const { q, deliveryId, delivery } = await booked();
    await db.query(
      "update public.deliveries set created_at=now()-interval '11 minutes' where order_id=$1",
      [q.id],
    );
    await delivery("pickup");
    await policy(q.id, "courier_check", deliveryId, "pickup");
    expect(await cases(q.id)).toEqual([]);
    const j = await jobFor(q.id, "courier_check");
    await delivery("pickup_complete");
    await rpc(
      "commerce_delivery_deadline",
      ["uuid", "uuid", "text", "text"],
      [j.id, j.lease_token, deliveryId, "pending"],
    );
    expect(await cases(q.id)).toEqual([]);
    await db.query(
      "update public.background_jobs set lease_expires_at=now()-interval '1 second' where id=$1",
      [j.id],
    );
    await expect(
      rpc(
        "commerce_delivery_deadline",
        ["uuid", "uuid", "text", "text"],
        [j.id, j.lease_token, deliveryId, "pickup_complete"],
      ),
    ).rejects.toMatchObject({ code: "40001" });
    expect((await order(q.id)).operational_status).toBe("in_delivery");
  });
  it("uses ETA plus fifteen minutes and recovers an early-completed ETA job", async () => {
    const { q, deliveryId, delivery } = await booked();
    await delivery("dropoff", {
      eta: new Date(Date.now() + 600000).toISOString(),
    });
    const j = await policy(q.id, "delivery_overdue", deliveryId, "dropoff");
    expect(await cases(q.id)).toEqual([]);
    await db.query(
      "update public.background_jobs set state='succeeded',lease_token=null,lease_expires_at=null where order_id=$1 and kind='delivery_overdue'",
      [q.id],
    );
    await db.query(
      "update public.deliveries set eta=now()-interval '16 minutes' where order_id=$1",
      [q.id],
    );
    await rpc("commerce_sweep", [], []);
    const recovered = (
      await db.query<{ id: string }>(
        "select id from public.background_jobs where order_id=$1 and kind='delivery_overdue' and state='pending' and due_at<=now()",
        [q.id],
      )
    ).rows;
    expect(recovered).toHaveLength(1);
    expect(recovered[0].id).not.toBe(j.id);
    await policy(q.id, "delivery_overdue", deliveryId, "dropoff");
    expect(await cases(q.id)).toEqual(["DELIVERY_OVERDUE"]);
    expect((await order(q.id)).payment_status).toBe("paid");
  });
  it("enforces the return deadline during review and ignores a return already received", async () => {
    const { q, deliveryId, delivery, booking } = await booked();
    await delivery("pickup_complete");
    const returnId = `ret_${randomUUID()}`;
    await delivery("canceled", { return_id: returnId });
    await rpc(
      "commerce_apply_delivery",
      ["uuid", "jsonb", "uuid", "uuid"],
      [
        q.id,
        { id: returnId, parent_id: deliveryId, status: "pickup" },
        booking.j.id,
        booking.j.lease_token,
      ],
    );
    await deadline(q.id, "return_overdue");
    expect(await cases(q.id)).toEqual([]);
    await rpc(
      "commerce_open_case",
      ["uuid", "text", "text", "text"],
      [q.id, `return-review:${q.id}`, "return", "RETURN_REVIEW"],
    );
    await db.query(
      "update public.deliveries set created_at=now()-interval '46 minutes' where order_id=$1 and direction='return'",
      [q.id],
    );
    await deadline(q.id, "return_overdue");
    expect(await cases(q.id)).toEqual(["RETURN_REVIEW", "RETURN_OVERDUE"]);
    const received = await booked();
    const receivedId = `ret_${randomUUID()}`;
    await received.delivery("pickup_complete");
    await received.delivery("canceled", { return_id: receivedId });
    await rpc(
      "commerce_open_case",
      ["uuid", "text", "text", "text"],
      [
        received.q.id,
        `return-review:${received.q.id}`,
        "return",
        "RETURN_REVIEW",
      ],
    );
    await rpc(
      "commerce_apply_delivery",
      ["uuid", "jsonb", "uuid", "uuid"],
      [
        received.q.id,
        { id: receivedId, parent_id: received.deliveryId, status: "delivered" },
        received.booking.j.id,
        received.booking.j.lease_token,
      ],
    );
    await db.query(
      "update public.deliveries set created_at=now()-interval '46 minutes' where order_id=$1 and direction='return'",
      [received.q.id],
    );
    await deadline(received.q.id, "return_overdue");
    expect(await cases(received.q.id)).toEqual(["RETURN_REVIEW"]);
  });
  it("keeps the customer-approved ETA deadline when the provider supplies a later forecast", async () => {
    const { q, deliveryId, delivery } = await booked(false, undefined, {
      eta: new Date(Date.now() - 16 * 60000).toISOString(),
    });
    await delivery("dropoff", {
      eta: new Date(Date.now() + 60 * 60000).toISOString(),
    });
    await policy(q.id, "delivery_overdue", deliveryId, "dropoff");
    expect(await cases(q.id)).toEqual(["DELIVERY_OVERDUE"]);
  });
  it.each(["not-a-date", "2026-13-45T25:00:00Z", { invalid: true }])(
    "does not stall recovery for an invalid legacy quote ETA %j",
    async (eta) => {
      const { q, deliveryId, delivery } = await booked(false, undefined, {
        eta,
      });
      await delivery("dropoff", {
        eta: new Date(Date.now() - 16 * 60000).toISOString(),
      });
      await policy(q.id, "delivery_overdue", deliveryId, "dropoff");
      expect(await cases(q.id)).toEqual(["DELIVERY_OVERDUE"]);
    },
  );
  it("accepts outbound canceled-to-returned facts while requiring a separately confirmed return leg", async () => {
    const { q, deliveryId, delivery, booking } = await booked();
    const returnId = `ret_${randomUUID()}`;
    await delivery("pickup_complete");
    await delivery("canceled", { return_id: returnId });
    // The relationship survives missing related_deliveries in a later read.
    await delivery("returned");
    expect((await order(q.id)).operational_status).toBe("returning");
    expect(await cases(q.id)).toEqual([]);
    await rpc(
      "commerce_apply_delivery",
      ["uuid", "jsonb", "uuid", "uuid"],
      [
        q.id,
        { id: returnId, parent_id: deliveryId, status: "delivered" },
        booking.j.id,
        booking.j.lease_token,
      ],
    );
    await delivery("returned", { return_id: returnId });
    expect(await order(q.id)).toMatchObject({
      operational_status: "returned",
      payment_status: "paid",
      settlement_status: "held",
      delivered_at: null,
    });
    expect(await cases(q.id)).toEqual([]);
    expect(
      (
        await db.query(
          "select direction,status from public.deliveries where order_id=$1 order by direction",
          [q.id],
        )
      ).rows,
    ).toEqual([
      { direction: "outbound", status: "returned" },
      { direction: "return", status: "delivered" },
    ]);
    expect(
      (
        await db.query(
          "select stock_on_hand,reserved_quantity from public.store_products where store_id=(select store_id from public.payment_orders where id=$1)",
          [q.id],
        )
      ).rows,
    ).toEqual([{ stock_on_hand: 99, reserved_quantity: 0 }]);
    expect(
      (
        await db.query(
          "select id from public.background_jobs where order_id=$1 and kind='schedule_clearing'",
          [q.id],
        )
      ).rows,
    ).toEqual([]);
  });
  it("preserves disputed clearing while physical return facts continue during review", async () => {
    const { q, deliveryId, delivery, booking } = await booked();
    const returnId = `ret_${randomUUID()}`;
    await delivery("pickup_complete");
    await rpc(
      "commerce_open_case",
      ["uuid", "text", "text", "text"],
      [q.id, `test-review:${q.id}`, "delivery", "DELIVERY_REVIEW"],
    );
    await delivery("canceled", { return_id: returnId });
    await rpc(
      "commerce_apply_delivery",
      ["uuid", "jsonb", "uuid", "uuid"],
      [
        q.id,
        { id: returnId, parent_id: deliveryId, status: "dropoff" },
        booking.j.id,
        booking.j.lease_token,
      ],
    );
    expect(await order(q.id)).toMatchObject({
      operational_status: "manual_review",
      settlement_status: "disputed",
    });
    await rpc(
      "commerce_apply_delivery",
      ["uuid", "jsonb", "uuid", "uuid"],
      [
        q.id,
        { id: returnId, parent_id: deliveryId, status: "delivered" },
        booking.j.id,
        booking.j.lease_token,
      ],
    );
    await delivery("returned", { return_id: returnId });
    expect(await order(q.id)).toMatchObject({
      operational_status: "manual_review",
      settlement_status: "disputed",
    });
    expect(await cases(q.id)).toEqual(["DELIVERY_REVIEW"]);
  });
  it("creates only one customer state notice for a deadline that opens review", async () => {
    const { q, deliveryId } = await booked(false, "customer@example.com");
    await db.query(
      "update public.deliveries set created_at=now()-interval '11 minutes' where order_id=$1",
      [q.id],
    );
    await policy(q.id, "courier_check", deliveryId, "pending");
    expect(
      (
        await db.query(
          "select j.id from public.background_jobs j join public.order_events e on e.id=j.reference_id where j.order_id=$1 and j.kind='customer_update' and e.after_state='manual_review'",
          [q.id],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("holds a contradictory return parent for review without reparenting or confirming receipt", async () => {
    const { q, deliveryId, delivery, booking } = await booked();
    const returnId = `ret_${randomUUID()}`;
    await delivery("pickup_complete");
    await delivery("canceled", { return_id: returnId });
    await rpc(
      "commerce_apply_delivery",
      ["uuid", "jsonb", "uuid", "uuid"],
      [
        q.id,
        { id: returnId, parent_id: deliveryId, status: "dropoff" },
        booking.j.id,
        booking.j.lease_token,
      ],
    );
    await rpc(
      "commerce_apply_delivery",
      ["uuid", "jsonb", "uuid", "uuid"],
      [
        q.id,
        { id: returnId, parent_id: "del_wrong_parent", status: "delivered" },
        booking.j.id,
        booking.j.lease_token,
      ],
    );
    expect(await cases(q.id)).toEqual(["PROVIDER_STATE_CONFLICT"]);
    expect(
      (
        await db.query(
          "select status,delivered_at from public.deliveries where provider_delivery_id=$1",
          [returnId],
        )
      ).rows,
    ).toEqual([{ status: "dropoff", delivered_at: null }]);
    expect((await order(q.id)).operational_status).toBe("manual_review");
  });
  it("rebuilds deleted checkout, merchant, preparation and case jobs without resetting existing failures or leases", async () => {
    const { store } = await fixture(),
      awaiting = await quote(store);
    await start(awaiting.id);
    const incoming = await quote(store);
    await start(incoming.id);
    await authorised(incoming.id);
    const preparing = await booked();
    const caseId = await rpc<string>(
      "commerce_open_case",
      ["uuid", "text", "text", "text"],
      [incoming.id, `test-case:${incoming.id}`, "test", "TEST_RECOVERY"],
    );
    const expected = (
      await db.query<{ job_key: string }>(
        "select job_key from public.background_jobs where (order_id=$1 and kind in ('authorise','checkout_expiry')) or (order_id=$2 and kind in ('preparation_reminder','preparation_overdue','courier_check')) or (reference_id=$3 and kind='operator_alert')",
        [awaiting.id, preparing.q.id, caseId],
      )
    ).rows
      .map((r) => r.job_key)
      .sort();
    await db.query(
      "delete from public.background_jobs where job_key=any($1::text[])",
      [expected],
    );
    await rpc("commerce_sweep", [], []);
    const restored = (
      await db.query<{ job_key: string }>(
        "select job_key from public.background_jobs where job_key=any($1::text[])",
        [expected],
      )
    ).rows
      .map((r) => r.job_key)
      .sort();
    expect(restored).toEqual(expected);
    expect(restored).toContain(`case-email:${caseId}`);
    const leased = await jobFor(preparing.q.id, "courier_check");
    await db.query(
      "update public.background_jobs set state='failed',attempts=12 where order_id=$1 and kind='authorise'",
      [awaiting.id],
    );
    await rpc("commerce_sweep", [], []);
    await rpc("commerce_sweep", [], []);
    expect(
      (
        await db.query(
          "select state,attempts from public.background_jobs where order_id=$1 and kind='authorise'",
          [awaiting.id],
        )
      ).rows,
    ).toEqual([{ state: "failed", attempts: 12 }]);
    expect(
      (
        await db.query(
          "select state,lease_token from public.background_jobs where id=$1",
          [leased.id],
        )
      ).rows,
    ).toEqual([{ state: "running", lease_token: leased.lease_token }]);
  });
  it("restores merchant reminders and their original authorisation-relative due times once", async () => {
    const { store } = await fixture(),
      q = await quote(store);
    await start(q.id);
    await authorised(q.id);
    const original = (
      await db.query(
        "select job_key,due_at,payload from public.background_jobs where order_id=$1 and kind in ('merchant_notify','merchant_timeout') order by job_key",
        [q.id],
      )
    ).rows;
    await db.query(
      "delete from public.background_jobs where order_id=$1 and kind in ('merchant_notify','merchant_timeout')",
      [q.id],
    );
    await rpc("commerce_sweep", [], []);
    await rpc("commerce_sweep", [], []);
    expect(
      (
        await db.query(
          "select job_key,due_at,payload from public.background_jobs where order_id=$1 and kind in ('merchant_notify','merchant_timeout') order by job_key",
          [q.id],
        )
      ).rows,
    ).toEqual(original);
  });
  it("rebuilds current notification and verified callback jobs with their original keys, leaving quarantine alone", async () => {
    const { q } = await booked(false, "customer@example.com");
    const expected = (
      await db.query<{ job_key: string }>(
        "select j.job_key from public.background_jobs j join public.order_events e on e.order_id=j.order_id where j.order_id=$1 and e.after_state='preparing' and (j.job_key='customer-email:'||e.id or j.job_key='merchant-prepare:'||e.id)",
        [q.id],
      )
    ).rows
      .map((r) => r.job_key)
      .sort();
    expect(expected).toHaveLength(2);
    await db.query(
      "delete from public.background_jobs where job_key=any($1::text[])",
      [expected],
    );
    const event = await rpc<string>(
      "commerce_ingest_event",
      ["jsonb"],
      [
        {
          provider: "uber",
          account: "test",
          environment: "sandbox",
          event_identity: randomUUID(),
          payload_hash: "hash",
          payload: { id: "evt_test" },
        },
      ],
    );
    const quarantined = await rpc<string>(
      "commerce_ingest_event",
      ["jsonb"],
      [
        {
          provider: "uber",
          account: "test",
          environment: "sandbox",
          event_identity: randomUUID(),
          payload_hash: "hash",
          payload: { id: "evt_other" },
        },
      ],
    );
    await db.query(
      "update public.external_events set state='quarantined' where id=$1",
      [quarantined],
    );
    await db.query(
      "delete from public.background_jobs where reference_id=any($1::uuid[])",
      [[event, quarantined]],
    );
    await rpc("commerce_sweep", [], []);
    await rpc("commerce_sweep", [], []);
    expect(
      (
        await db.query<{ job_key: string }>(
          "select job_key from public.background_jobs where job_key=any($1::text[]) order by job_key",
          [expected],
        )
      ).rows.map((r) => r.job_key),
    ).toEqual(expected);
    expect(
      (
        await db.query(
          "select reference_id,job_key from public.background_jobs where reference_id=any($1::uuid[])",
          [[event, quarantined]],
        )
      ).rows,
    ).toEqual([{ reference_id: event, job_key: `inbox:${event}` }]);
  });
  it("continues existing refund recovery after terminal fulfilment without creating a second refund", async () => {
    const { q, delivery } = await booked();
    await delivery("delivered");
    const refundId = randomUUID();
    await rpc(
      "commerce_refund_reserve",
      ["uuid", "uuid", "int", "jsonb", "text", "text", "text"],
      [
        q.id,
        refundId,
        100,
        { products: 100, service: 0, delivery: 0 },
        "Missing product",
        "test-admin",
        "unknown",
      ],
    );
    const { op } = await operation(q.id, "refund");
    await db.query(
      "update public.provider_operations set status='unknown' where id=$1",
      [op.id],
    );
    await db.exec("select set_config('ruvon.command','on',false)");
    await db.query(
      "update public.payment_orders set operational_status='completed',completed_at=now() where id=$1",
      [q.id],
    );
    await db.exec("select set_config('ruvon.command','off',false)");
    await db.query("delete from public.background_jobs where job_key=$1", [
      `refund:${refundId}`,
    ]);
    await rpc("commerce_sweep", [], []);
    await rpc("commerce_sweep", [], []);
    expect(
      (
        await db.query(
          "select reference_id from public.background_jobs where kind='operation_reconcile' and reference_id=$1",
          [op.id],
        )
      ).rows,
    ).toEqual([{ reference_id: op.id }]);
    expect(
      (
        await db.query(
          "select reference_id from public.background_jobs where job_key=$1",
          [`refund:${refundId}`],
        )
      ).rows,
    ).toEqual([{ reference_id: refundId }]);
    expect(
      (
        await db.query("select id from public.refunds where order_id=$1", [
          q.id,
        ])
      ).rows,
    ).toEqual([{ id: refundId }]);
    expect((await order(q.id)).operational_status).toBe("completed");
  });
  it("recovers a missing return read from the outbound provider resource, without inventing a return ID", async () => {
    const { q, deliveryId, delivery } = await booked();
    await delivery("pickup_complete");
    const returnId = `ret_${randomUUID()}`;
    await delivery("canceled", { return_id: returnId });
    await db.query("delete from public.background_jobs where job_key=$1", [
      `return-reconcile:${returnId}`,
    ]);
    await rpc("commerce_sweep", [], []);
    const reads = (
      await db.query<{ payload: unknown }>(
        "select payload from public.background_jobs where order_id=$1 and job_key like 'delivery-sweep:%'",
        [q.id],
      )
    ).rows;
    expect(reads).toEqual([{ payload: { delivery_id: deliveryId } }]);
    await delivery("canceled", { return_id: returnId });
    expect(
      (
        await db.query(
          "select payload from public.background_jobs where job_key=$1",
          [`return-reconcile:${returnId}`],
        )
      ).rows,
    ).toEqual([{ payload: { delivery_id: returnId, parent_id: deliveryId } }]);
    expect(
      (
        await db.query(
          "select id from public.deliveries where order_id=$1 and direction='outbound'",
          [q.id],
        )
      ).rows,
    ).toHaveLength(1);
  });
});

describe("durable notification delivery", () => {
  async function notification() {
    const { store } = await fixture(),
      q = await quote(store);
    await start(q.id);
    await authorised(q.id);
    const j = await jobFor(q.id, "merchant_notify");
    const n = await rpc<{ id: string; request: unknown }>(
      "commerce_prepare_notification",
      ["uuid", "uuid", "text", "text"],
      [j.id, j.lease_token, "email", `store:${store}`],
    );
    const body = {
      from: "Ruvon <pedidos@ruvon.store>",
      to: ["test@example.com"],
      text: "Open the authenticated dashboard",
      tags: [
        { name: "notification_id", value: n.id },
        { name: "environment", value: "sandbox" },
      ],
    };
    const dispatch = () =>
      rpc(
        "commerce_dispatch_notification",
        ["uuid", "uuid", "uuid", "jsonb"],
        [n.id, j.id, j.lease_token, body],
      );
    return { q, j, n, body, dispatch };
  }
  it("freezes the request, retries the same identity, and fences completion after lease loss", async () => {
    const { q, j, n, body, dispatch } = await notification();
    expect((await dispatch()).allowed).toBe(true);
    await rpc(
      "commerce_finish_notification",
      ["uuid", "uuid", "uuid", "text", "text", "boolean"],
      [n.id, j.id, j.lease_token, null, "transport_unknown", false],
    );
    expect((await dispatch()).request).toEqual(body);
    await expect(
      rpc(
        "commerce_dispatch_notification",
        ["uuid", "uuid", "uuid", "jsonb"],
        [n.id, j.id, j.lease_token, { ...body, to: ["other@example.com"] }],
      ),
    ).rejects.toThrow("immutable");
    expect(
      (
        await db.query("select * from public.notifications where order_id=$1", [
          q.id,
        ])
      ).rows,
    ).toHaveLength(1);
    await db.query(
      "update public.background_jobs set lease_expires_at=now()-interval '1 second' where id=$1",
      [j.id],
    );
    await expect(
      rpc(
        "commerce_finish_notification",
        ["uuid", "uuid", "uuid", "text"],
        [n.id, j.id, j.lease_token, randomUUID()],
      ),
    ).rejects.toThrow("Lease lost");
  });
  it("skips stale unstarted messages but still reconciles a previously uncertain send", async () => {
    const a = await notification(),
      b = await notification();
    await a.dispatch();
    for (const current of [a, b])
      await rpc(
        "commerce_fail_order",
        ["uuid", "text"],
        [current.q.id, "MERCHANT_REJECTED"],
      );
    expect((await a.dispatch()).allowed).toBe(true);
    expect((await b.dispatch()).allowed).toBe(false);
    expect(
      (
        await db.query(
          "select status,request from public.notifications where id=$1",
          [b.n.id],
        )
      ).rows[0],
    ).toEqual({ status: "skipped", request: null });
  });
  it("never replays an uncertain send after the provider protection window", async () => {
    const { n, dispatch } = await notification();
    await dispatch();
    await db.query(
      "update public.notifications set retry_safe_until=now()-interval '1 second' where id=$1",
      [n.id],
    );
    expect(await dispatch()).toMatchObject({
      allowed: false,
      reason: "replay_expired",
    });
    expect(
      (
        await db.query(
          "select status,last_error from public.notifications where id=$1",
          [n.id],
        )
      ).rows[0],
    ).toEqual({
      status: "unknown",
      last_error: "email_reconciliation_required",
    });
  });
  it("recovers a lost send response through signed inbox references and resists duplicate/reversed observations", async () => {
    const { n, dispatch, j } = await notification();
    await dispatch();
    const providerId = randomUUID();
    async function event(type: string, identity = randomUUID()) {
      const eid = await rpc<string>(
        "commerce_ingest_event",
        ["jsonb"],
        [
          {
            provider: "resend",
            account: "ruvon.store",
            environment: "sandbox",
            event_identity: identity,
            resource_id: providerId,
            provider_time: new Date().toISOString(),
            payload_hash: identity,
            payload: {
              type,
              from: "pedidos@ruvon.store",
              notification_id: n.id,
            },
          },
        ],
      );
      const worker = (
        await db.query<{ id: string; lease_token: string }>(
          "update public.background_jobs set state='running',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds' where reference_id=$1 returning *",
          [eid],
        )
      ).rows[0];
      await rpc(
        "commerce_apply_notification_event",
        ["uuid", "uuid", "uuid"],
        [eid, worker.id, worker.lease_token],
      );
      return eid;
    }
    const key = randomUUID();
    expect(await event("email.delivered", key)).toBe(
      await event("email.delivered", key),
    );
    await event("email.sent");
    expect(
      (
        await db.query(
          "select provider_id,status from public.notifications where id=$1",
          [n.id],
        )
      ).rows[0],
    ).toEqual({ provider_id: providerId, status: "delivered" });
    await rpc(
      "commerce_finish_notification",
      ["uuid", "uuid", "uuid", "text"],
      [n.id, j.id, j.lease_token, providerId],
    );
    expect((await dispatch()).allowed).toBe(false);
    await event("email.complained");
    await event("email.delivered");
    expect(
      (
        await db.query("select status from public.notifications where id=$1", [
          n.id,
        ])
      ).rows[0],
    ).toEqual({ status: "failed" });
  });
  it("commits customer email work with the transition and deduplicates recurring case alerts", async () => {
    const { store } = await fixture(),
      q = await quote(store);
    await rpc(
      "commerce_start_order",
      ["uuid", "text", "uuid", "jsonb", "text", "text", "boolean"],
      [
        q.id,
        "a".repeat(64),
        randomUUID(),
        { name: "Test", phone: "911234567", email: "customer@example.com" },
        "MBW",
        randomUUID(),
        false,
      ],
    );
    await authorised(q.id);
    expect(
      (
        await db.query(
          "select payload from public.background_jobs where order_id=$1 and kind='customer_update'",
          [q.id],
        )
      ).rows,
    ).toEqual([{ payload: { state: "awaiting_merchant" } }]);
    const cid = await rpc(
      "commerce_open_case",
      ["uuid", "text", "text", "text"],
      [q.id, `notice:${q.id}`, "test", "TEST_REVIEW"],
    );
    await db.query(
      "update public.order_cases set created_at=now()-interval '31 minutes' where id=$1",
      [cid],
    );
    await rpc("commerce_sweep", [], []);
    await rpc("commerce_sweep", [], []);
    expect(
      (
        await db.query(
          "select * from public.background_jobs where reference_id=$1 and job_key like 'case-reminder-email:%'",
          [cid],
        )
      ).rows,
    ).toHaveLength(1);
    await db.exec("set role authenticated");
    try {
      await expect(
        db.query("select * from public.notifications"),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("durable SMS without provider POST replay", () => {
  const account = `AC${"a".repeat(32)}`;
  async function sms() {
    const providerId = `SM${randomUUID().replaceAll("-", "")}`;
    const { store } = await fixture(),
      q = await quote(store);
    await start(q.id);
    await authorised(q.id);
    const j = (
      await db.query<{ id: string; lease_token: string }>(
        "update public.background_jobs set due_at=now(),state='running',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds' where order_id=$1 and kind='merchant_notify' and payload->>'channel'='sms' returning id,lease_token",
        [q.id],
      )
    ).rows[0];
    const n = await rpc<{ id: string }>(
      "commerce_prepare_notification",
      ["uuid", "uuid", "text", "text"],
      [j.id, j.lease_token, "sms", `store:${store}`],
    );
    const body = {
      account,
      from: "+15005550006",
      service: null,
      to: ["+351911234567"],
      text: "Synthetic Ruvon dashboard notice",
      callback: `https://ruvon.store/api/webhooks/twilio?notification_id=${n.id}`,
    };
    const dispatch = (request = body) =>
      rpc(
        "commerce_dispatch_notification",
        ["uuid", "uuid", "uuid", "jsonb"],
        [n.id, j.id, j.lease_token, request],
      );
    const fact = (status = "queued") => ({
      id: providerId,
      account,
      from: body.from,
      to: body.to[0],
      service: null,
      status,
      error_code: null,
    });
    const apply = (f = fact(), worker = j, event: string | null = null) =>
      rpc(
        "commerce_apply_sms_fact",
        ["uuid", "uuid", "uuid", "jsonb", "uuid"],
        [worker.id, worker.lease_token, n.id, f, event],
      );
    const state = async () =>
      (
        await db.query<Record<string, unknown>>(
          "select status,provider_status,provider_id,last_error,attempts,first_dispatch_at,retry_safe_until,request from public.notifications where id=$1",
          [n.id],
        )
      ).rows[0];
    return { q, j, n, body, fact, dispatch, apply, state, providerId };
  }
  it("grants one dispatch, freezes the recipient and schedules durable reads before the POST", async () => {
    const s = await sms();
    expect((await s.dispatch()).allowed).toBe(true);
    expect(await s.state()).toMatchObject({
      status: "sending",
      attempts: 1,
      retry_safe_until: null,
      request: s.body,
    });
    expect(
      (
        await db.query(
          "select * from public.background_jobs where kind='notification_reconcile' and reference_id=$1",
          [s.n.id],
        )
      ).rows,
    ).toHaveLength(6);
    await rpc(
      "commerce_finish_notification",
      ["uuid", "uuid", "uuid", "text", "text", "boolean"],
      [s.n.id, s.j.id, s.j.lease_token, null, "transport_unknown", false],
    );
    await expect(
      s.dispatch({ ...s.body, to: ["+351922222222"] }),
    ).rejects.toThrow("immutable");
    expect(await s.dispatch()).toMatchObject({
      allowed: false,
      reason: "already_dispatched",
    });
    expect(await s.state()).toMatchObject({ status: "unknown", attempts: 1 });
  });
  it("rejects invalid SMS envelopes atomically before any dispatch or read jobs", async () => {
    const s = await sms();
    for (const changes of [
      { account: "bad" },
      { to: [] },
      { to: ["not-a-phone"] },
      { from: null },
      { callback: "https://attacker.invalid/path" },
    ])
      await expect(
        s.dispatch({ ...s.body, ...changes } as typeof s.body),
      ).rejects.toThrow();
    expect(await s.state()).toMatchObject({
      status: "pending",
      first_dispatch_at: null,
      request: null,
      attempts: 0,
    });
    expect(
      (
        await db.query(
          "select * from public.background_jobs where kind='notification_reconcile' and reference_id=$1",
          [s.n.id],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("fences a new worker's replay and the old worker's late provider result", async () => {
    const s = await sms();
    await s.dispatch();
    const nextToken = randomUUID();
    await db.query(
      "update public.background_jobs set lease_token=$2,lease_expires_at=now()+interval '90 seconds' where id=$1",
      [s.j.id, nextToken],
    );
    await expect(s.apply()).rejects.toThrow();
    expect(
      await rpc(
        "commerce_dispatch_notification",
        ["uuid", "uuid", "uuid", "jsonb"],
        [s.n.id, s.j.id, nextToken, s.body],
      ),
    ).toMatchObject({ allowed: false, reason: "already_dispatched" });
    expect(await s.state()).toMatchObject({ attempts: 1, provider_id: null });
  });
  it("recovers an unknown result through a verified callback read without regressing terminal facts", async () => {
    const s = await sms();
    await s.dispatch();
    async function event(status: string, identity = randomUUID()) {
      const eid = await rpc<string>(
        "commerce_ingest_event",
        ["jsonb"],
        [
          {
            provider: "twilio",
            account,
            environment: "sandbox",
            event_identity: identity,
            resource_id: s.providerId,
            payload_hash: identity,
            payload: { notification_id: s.n.id },
          },
        ],
      );
      const worker = (
        await db.query<{ id: string; lease_token: string }>(
          "update public.background_jobs set state='running',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds' where kind='external_event' and reference_id=$1 returning id,lease_token",
          [eid],
        )
      ).rows[0];
      await s.apply(s.fact(status), worker, eid);
      return eid;
    }
    const id = randomUUID();
    expect(await event("delivered", id)).toBe(await event("delivered", id));
    await event("queued");
    expect(await s.state()).toMatchObject({
      status: "delivered",
      provider_status: "delivered",
      provider_id: s.providerId,
      attempts: 1,
    });
    const conflict = await event("failed");
    expect(
      (
        await db.query(
          "select state,processing_error from public.external_events where id=$1",
          [conflict],
        )
      ).rows[0],
    ).toEqual({
      state: "quarantined",
      processing_error: "PROVIDER_STATE_CONFLICT",
    });
    expect(await s.state()).toMatchObject({
      status: "delivered",
      last_error: "sms_provider_state_conflict",
    });
  });
  it("rejects foreign provider facts and unrelated jobs without changing the notification", async () => {
    const a = await sms(),
      b = await sms();
    await a.dispatch();
    await expect(a.apply({ ...a.fact(), to: "+351922222222" })).rejects.toThrow(
      "identity",
    );
    await expect(
      a.apply({ ...a.fact(), account: `AC${"c".repeat(32)}` }),
    ).rejects.toThrow("identity");
    await expect(a.apply(a.fact(), b.j)).rejects.toThrow("job conflict");
    expect(await a.state()).toMatchObject({
      status: "sending",
      provider_id: null,
    });
  });
  it("reconstructs the same six reads and preserves failed, completed and leased jobs", async () => {
    const s = await sms();
    await s.dispatch();
    const rows = (
      await db.query<{ id: string; job_key: string }>(
        "select id,job_key from public.background_jobs where kind='notification_reconcile' and reference_id=$1 order by job_key",
        [s.n.id],
      )
    ).rows;
    await db.query(
      "update public.background_jobs set state='failed',last_error='fixture' where id=$1",
      [rows[0].id],
    );
    await db.query(
      "update public.background_jobs set state='succeeded' where id=$1",
      [rows[1].id],
    );
    const lease = randomUUID();
    await db.query(
      "update public.background_jobs set state='running',lease_token=$2,lease_expires_at=now()+interval '90 seconds' where id=$1",
      [rows[2].id, lease],
    );
    await db.query("delete from public.background_jobs where id=$1", [
      rows[3].id,
    ]);
    await rpc("commerce_sweep", [], []);
    await rpc("commerce_sweep", [], []);
    expect(
      (
        await db.query(
          "select * from public.background_jobs where kind='notification_reconcile' and reference_id=$1",
          [s.n.id],
        )
      ).rows,
    ).toHaveLength(6);
    expect(
      (
        await db.query(
          "select state from public.background_jobs where id=any($1::uuid[]) order by state",
          [[rows[0].id, rows[1].id]],
        )
      ).rows,
    ).toEqual([{ state: "failed" }, { state: "succeeded" }]);
    expect(
      (
        await db.query(
          "select lease_token from public.background_jobs where id=$1",
          [rows[2].id],
        )
      ).rows[0],
    ).toEqual({ lease_token: lease });
    expect(
      (
        await db.query(
          "select count(*)::int count from public.background_jobs where job_key=$1",
          [rows[3].job_key],
        )
      ).rows[0],
    ).toEqual({ count: 1 });
    expect(await s.state()).toMatchObject({ attempts: 1 });
  });
  it("keeps missing IDs unknown only after database time and does not change the order state", async () => {
    const s = await sms();
    await s.dispatch();
    const before = await order(s.q.id);
    const reader = (
      await db.query<{ id: string; lease_token: string }>(
        "update public.background_jobs set state='running',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds' where reference_id=$1 and kind='notification_reconcile' and payload->>'after_seconds'='300' returning id,lease_token",
        [s.n.id],
      )
    ).rows[0];
    await expect(
      rpc(
        "commerce_sms_unconfirmed",
        ["uuid", "uuid", "uuid"],
        [reader.id, reader.lease_token, s.n.id],
      ),
    ).rejects.toThrow();
    await db.query(
      "update public.notifications set first_dispatch_at=now()-interval '6 minutes' where id=$1",
      [s.n.id],
    );
    await db.query(
      "update public.background_jobs set due_at=now()-interval '1 second' where id=$1",
      [reader.id],
    );
    await rpc(
      "commerce_sms_unconfirmed",
      ["uuid", "uuid", "uuid"],
      [reader.id, reader.lease_token, s.n.id],
    );
    expect(await s.state()).toMatchObject({
      status: "unknown",
      last_error: "sms_reconciliation_required",
      provider_id: null,
      attempts: 1,
    });
    expect((await order(s.q.id)).operational_status).toBe(
      before.operational_status,
    );
  });
  it("does not declare a pending carrier delivery failed by a local timer and denies public RPCs", async () => {
    const s = await sms();
    await s.dispatch();
    await db.query(
      "update public.notifications set first_dispatch_at=now()-interval '25 hours' where id=$1",
      [s.n.id],
    );
    await s.apply(s.fact("queued"));
    expect(await s.state()).toMatchObject({
      status: "unknown",
      provider_status: "queued",
      last_error: "sms_delivery_unconfirmed",
    });
    const permissions = (
      await db.query<{ helper: boolean; fact: boolean; public_fact: boolean }>(
        "select has_function_privilege('service_role','public.commerce_schedule_sms_reads(uuid)','EXECUTE') helper,has_function_privilege('service_role','public.commerce_apply_sms_fact(uuid,uuid,uuid,jsonb,uuid)','EXECUTE') fact,has_function_privilege('authenticated','public.commerce_apply_sms_fact(uuid,uuid,uuid,jsonb,uuid)','EXECUTE') public_fact",
      )
    ).rows[0];
    expect(permissions).toEqual({
      helper: false,
      fact: true,
      public_fact: false,
    });
  });
});
