import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { OperationsMonitor } from "@/lib/operations";

const db = new PGlite();
let admin: string;

beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;",
  );
  // Model hosted Supabase creation defaults, including its broader service grants.
  await db.exec(
    "alter default privileges in schema public grant all on tables to anon,authenticated,service_role;alter default privileges in schema public grant all on functions to anon,authenticated,service_role;",
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(
      (await readFile(`supabase/migrations/${file}`, "utf8")).replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
}, 20000);
beforeEach(async () => {
  await db.exec("reset role");
  admin = randomUUID();
  await db.query("insert into auth.users values($1)", [admin]);
  await identity(admin);
});
afterAll(() => db.close());

async function identity(
  user: string | null,
  claims: unknown = { app_metadata: { role: "operations_admin" } },
) {
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [user ?? "", JSON.stringify(claims)],
  );
}
async function monitor(environment = "sandbox") {
  return (
    await db.query<{ result: OperationsMonitor }>(
      "select public.operations_monitor($1) result",
      [environment],
    )
  ).rows[0].result;
}
async function control(
  action: string,
  target: string,
  version: number,
  command = randomUUID(),
  reason = "Verified operational reason",
) {
  return (
    await db.query<{ result: Record<string, unknown> }>(
      "select public.operations_control($1::uuid,$2,$3::uuid,$4::integer,$5) result",
      [command, action, target, version, reason],
    )
  ).rows[0].result;
}
async function store() {
  const id = randomUUID();
  await db.query(
    "insert into public.stores(id,name,enabled,paused,pickup_address,phone,email,heartbeat_at) values($1,$2,true,false,'{\"street_address\":\"PRIVATE_ADDRESS\"}','PRIVATE_PHONE','private@example.com',now())",
    [id, `Test ${id}`],
  );
  await db.query("insert into public.store_users values($1,$2,'staff',true)", [
    id,
    admin,
  ]);
  return id;
}
async function inbox(
  state = "pending",
  kind = "external_event",
  jobState = "failed",
) {
  const id = randomUUID(),
    job = randomUUID(),
    token = randomUUID();
  await db.query(
    "insert into public.external_events(id,provider,account,environment,event_identity,payload_hash,payload,verified,state,received_at) values($1,'resend','ruvon.store','sandbox',$2,'private-hash','{\"private\":\"PRIVATE_PAYLOAD\"}',true,$3,now()-interval '10 minutes')",
    [id, `msg_${id}`, state],
  );
  await db.query(
    "insert into public.background_jobs(id,kind,reference_id,job_key,payload,state,attempts,lease_token,lease_expires_at,last_error) values($1,$2,$3,$4,'{\"private\":\"PRIVATE_JOB_BODY\"}',$5,12,$6,now()+interval '90 seconds','retry_exhausted')",
    [job, kind, id, `inbox:${id}`, jobState, token],
  );
  return { id, job, token };
}

describe("named operational monitoring and controls", () => {
  it("narrows Supabase service defaults without breaking legacy writes or named commands", async () => {
    for (const table of ["payment_orders", "payment_attempts"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE"])
        expect(
          (
            await db.query<{ allowed: boolean }>(
              "select has_table_privilege('service_role',$1,$2) allowed",
              ["public." + table, privilege],
            )
          ).rows[0].allowed,
        ).toBe(true);
      for (const privilege of ["DELETE", "TRUNCATE", "TRIGGER", "REFERENCES"])
        expect(
          (
            await db.query<{ allowed: boolean }>(
              "select has_table_privilege('service_role',$1,$2) allowed",
              ["public." + table, privilege],
            )
          ).rows[0].allowed,
        ).toBe(false);
    }
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_table_privilege('service_role','public.leads','DELETE') allowed",
        )
      ).rows[0].allowed,
    ).toBe(true);
    for (const signature of [
      "protect_payment_attempt()",
      "protect_payment_snapshot()",
      "commerce_protect_operation()",
      "commerce_policy_timestamp(text)",
    ])
      for (const role of ["anon", "authenticated", "service_role"])
        expect(
          (
            await db.query<{ allowed: boolean }>(
              "select has_function_privilege($1,$2,'EXECUTE') allowed",
              [role, "public." + signature],
            )
          ).rows[0].allowed,
        ).toBe(false);
    for (const role of ["anon", "authenticated", "service_role"])
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege($1,'public.commerce_delivery_deadline(uuid,uuid,text,text)','EXECUTE') allowed",
            [role],
          )
        ).rows[0].allowed,
      ).toBe(role === "service_role");
    for (const signature of [
      "merchant_heartbeat(uuid)",
      "operations_command(uuid,uuid,integer,text,text,uuid,integer,jsonb)",
    ]) {
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege('authenticated',$1,'EXECUTE') allowed",
            ["public." + signature],
          )
        ).rows[0].allowed,
      ).toBe(true);
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege('service_role',$1,'EXECUTE') allowed",
            ["public." + signature],
          )
        ).rows[0].allowed,
      ).toBe(false);
    }
  });
  it("rejects anonymous identities, merchants and user-controlled admin metadata", async () => {
    const target = await store();
    for (const [user, claims] of [
      [null, {}],
      [admin, {}],
      [admin, { user_metadata: { role: "operations_admin" } }],
    ] as const) {
      await identity(user, claims);
      await expect(monitor()).rejects.toMatchObject({ code: "42501" });
      await expect(control("pause_store", target, 0)).rejects.toMatchObject({
        code: "42501",
      });
    }
    await identity(admin);
    expect((await monitor()).stores.some((s) => s.id === target)).toBe(true);
  });

  it("denies raw audit access and anonymous/service invocation of named controls", async () => {
    await db.exec("set role authenticated");
    await expect(
      db.query("select * from public.operations_audit"),
    ).rejects.toThrow();
    await expect(
      db.query("update public.stores set paused=false"),
    ).rejects.toThrow();
    await db.exec("reset role");
    for (const role of ["anon", "service_role"]) {
      await db.exec(`set role ${role}`);
      await expect(monitor()).rejects.toMatchObject({ code: "42501" });
      await expect(
        control("pause_store", randomUUID(), 0),
      ).rejects.toMatchObject({ code: "42501" });
      await db.exec("reset role");
    }
    expect(
      (
        await db.query<{ rls: boolean }>(
          "select relrowsecurity rls from pg_class where oid='public.operations_audit'::regclass",
        )
      ).rows[0].rls,
    ).toBe(true);
  });

  it("replays one audited store command and rejects changed intent or actor", async () => {
    const id = await store(),
      command = randomUUID();
    const first = await control("pause_store", id, 0, command);
    expect(first).toMatchObject({ id, paused: true, version: 1 });
    expect(await control("pause_store", id, 0, command)).toEqual(first);
    await expect(
      control("pause_store", id, 0, command, "Different reason"),
    ).rejects.toMatchObject({ code: "23505" });
    const other = randomUUID();
    await db.query("insert into auth.users values($1)", [other]);
    await identity(other);
    await expect(control("pause_store", id, 0, command)).rejects.toMatchObject({
      code: "23505",
    });
    const rows = await db.query(
      "select * from public.operations_audit where command_id=$1",
      [command],
    );
    expect(rows.rows).toHaveLength(1);
    await expect(
      db.query(
        "update public.operations_audit set reason=$1 where command_id=$2",
        ["Changed", command],
      ),
    ).rejects.toThrow("Immutable");
    await expect(
      db.query("delete from public.operations_audit where command_id=$1", [
        command,
      ]),
    ).rejects.toThrow("Immutable");
  });

  it("detects merchant/automation pause races while heartbeats preserve the control version", async () => {
    const id = await store();
    await control("pause_store", id, 0);
    await db.query("select public.merchant_heartbeat($1)", [id]);
    expect(
      (await monitor()).stores.find((s) => s.id === id)?.operations_version,
    ).toBe(1);
    await db.query("select public.merchant_set_paused($1,false)", [id]);
    await expect(control("pause_store", id, 1)).rejects.toMatchObject({
      code: "40001",
    });
    await db.query(
      "update public.stores set paused=true,pause_reason='REPEATED_TIMEOUTS' where id=$1",
      [id],
    );
    expect(
      (await monitor()).stores.find((s) => s.id === id)?.operations_version,
    ).toBe(3);
    await expect(control("resume_store", id, 2)).rejects.toMatchObject({
      code: "40001",
    });
  });

  it("allows resumption only for an enabled store with a current heartbeat", async () => {
    const id = await store();
    await control("pause_store", id, 0);
    for (const interval of ["-100 seconds", "10 seconds"]) {
      await db.query(
        "update public.stores set heartbeat_at=now()+$2::interval where id=$1",
        [id, interval],
      );
      await expect(control("resume_store", id, 1)).rejects.toMatchObject({
        code: "40001",
      });
    }
    await db.query(
      "update public.stores set heartbeat_at=now(),enabled=false where id=$1",
      [id],
    );
    await expect(control("resume_store", id, 2)).rejects.toMatchObject({
      code: "40001",
    });
    await db.query("update public.stores set enabled=true where id=$1", [id]);
    expect(await control("resume_store", id, 3)).toMatchObject({
      paused: false,
      version: 4,
    });
    expect(
      (
        await db.query(
          "select * from public.operations_audit where target_id=$1",
          [id],
        )
      ).rows,
    ).toHaveLength(2);
  });

  it("reuses the failed inbox job and fences its previous worker after an audited retry", async () => {
    const { job, token, id } = await inbox(),
      command = randomUUID();
    expect((await monitor()).jobs.find((j) => j.id === job)?.can_retry).toBe(
      true,
    );
    expect(await control("retry_event", job, 12, command)).toMatchObject({
      id: job,
      state: "pending",
      attempts: 12,
    });
    expect(await control("retry_event", job, 12, command)).toMatchObject({
      id: job,
      state: "pending",
    });
    const row = (
      await db.query<{
        state: string;
        reference_id: string;
        lease_token: string | null;
      }>(
        "select state,reference_id,lease_token from public.background_jobs where id=$1",
        [job],
      )
    ).rows[0];
    expect(row).toEqual({
      state: "pending",
      reference_id: id,
      lease_token: null,
    });
    expect(
      (
        await db.query<{ finished: boolean }>(
          "select public.commerce_finish_job($1,$2) finished",
          [job, token],
        )
      ).rows[0].finished,
    ).toBe(false);
    expect(
      (
        await db.query(
          "select * from public.background_jobs where reference_id=$1",
          [id],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.provider_operations")).rows,
    ).toHaveLength(0);
  });

  it("refuses financial jobs, active leases, stale attempts, processed events and quarantined callbacks", async () => {
    const financial = await inbox("pending", "confirm_order");
    await expect(
      control("retry_event", financial.job, 12),
    ).rejects.toMatchObject({ code: "22023" });
    const active = await inbox("pending", "external_event", "running");
    await expect(control("retry_event", active.job, 12)).rejects.toMatchObject({
      code: "40001",
    });
    const failed = await inbox();
    await expect(control("retry_event", failed.job, 11)).rejects.toMatchObject({
      code: "40001",
    });
    for (const state of ["quarantined", "processed"]) {
      const event = await inbox(state);
      await expect(control("retry_event", event.job, 12)).rejects.toMatchObject(
        { code: "40001" },
      );
      expect(
        (await monitor()).jobs.find((j) => j.id === event.job)?.can_retry,
      ).toBe(false);
    }
  });

  it("returns bounded safe DTOs without contact details, owner hashes or provider bodies", async () => {
    const id = await store();
    await inbox("quarantined");
    await db.query(
      "insert into public.notifications(channel,purpose,recipient_reference,template,deduplication_key,environment,request,status) values('email','operator_alert','PRIVATE_RECIPIENT','operator_alert',$1,'sandbox','{\"text\":\"PRIVATE_EMAIL_BODY\"}','failed')",
      [randomUUID()],
    );
    const result = await monitor(),
      serialized = JSON.stringify(result);
    expect(result.stores.find((s) => s.id === id)?.connected).toBe(true);
    expect(result.notifications.length).toBeGreaterThan(0);
    for (const marker of [
      "PRIVATE_ADDRESS",
      "PRIVATE_PHONE",
      "private@example.com",
      "PRIVATE_PAYLOAD",
      "PRIVATE_JOB_BODY",
      "PRIVATE_RECIPIENT",
      "PRIVATE_EMAIL_BODY",
      "owner_hash",
      "payload_hash",
      "idempotency_key",
    ])
      expect(serialized).not.toContain(marker);
    await expect(monitor("invalid")).rejects.toMatchObject({ code: "22023" });
  });

  it("marks missing, stale and future worker health as unhealthy", async () => {
    expect((await monitor()).worker).toBeNull();
    await db.query("select public.commerce_worker_health(true,2)");
    expect((await monitor()).worker).toMatchObject({
      healthy: true,
      jobs_processed: 2,
    });
    for (const interval of ["-121 seconds", "10 seconds"]) {
      await db.query(
        "update public.worker_health set last_success_at=now()+$1::interval",
        [interval],
      );
      expect((await monitor()).worker?.healthy).toBe(false);
    }
  });

  it("caps inbox results at 100 and retains the oldest exceptions first", async () => {
    await db.exec(
      "insert into public.external_events(provider,account,environment,event_identity,payload_hash,payload,verified,state,received_at) select 'resend','ruvon.store','sandbox','bounded-'||n,'hash','{}',true,'quarantined','2000-01-01'::timestamptz+n*interval '1 second' from generate_series(1,105) n",
    );
    const events = (await monitor()).events;
    expect(events).toHaveLength(100);
    expect(events[0].event_identity).toBe("bounded-1");
    expect(events[99].event_identity).toBe("bounded-100");
  });
});
