# Automated orders implementation status

Updated 2026-10-12. **This is an incomplete, disabled implementation. It is not a launch or a successful provider acceptance test.** No migrations 006–011 have been applied to a hosted project in this implementation session; no new code has been deployed and no live money movement has been attempted.

## Implemented locally

- Additive migrations 006–011 evolve `payment_orders` / `payment_attempts`; validation records and migrations 001–005 remain intact.
- Explicit SKU recipes, store prices, integer-cent allocations, whole-basket stock reservations, snapshot protection, membership checks, versioned commands and append-only events.
- Durable external operations, webhook inbox, Postgres jobs, leases/fencing, timeout handling, safe reconciliation and compensation intents. The worker drains newly committed capture/booking work within its ten-job / two-consumer / 20-second budget. No browser is required to run persisted work.
- Easypay MB WAY authorisation and hosted card manifest adapters; authoritative resource checks; capture splits, void, refund and future clearing-date operations. Fixtures exercise documented shapes; account behaviour is not verified.
- Uber DaaS quoting, one outbound creation intent, authenticated status reads, exact-byte HMAC verification and separate return relationships. Unknown bookings are never blindly reposted.
- Owned customer status/cancellation/issues routes, a separate commerce cart with receipt deduplication, address/quote checkout, merchant login/dashboard/heartbeat/inventory/return condition recording, and named-admin reconciliation/full and partial refund/case resolution controls. Audited case recovery checks provider uncertainty and physical state before resuming or cancelling.
- Commerce, sandbox and staff routes do not emit validation analytics. The commerce cart does not hydrate or overwrite the validation cart; the explicit interest route remains separate.
- Checkout kill switch plus database capability evidence gates and worker freshness checks. Gates are empty/unverified and checkout remains disabled.

## Still required in code and operations

| Area                       | Remaining work / why it is not complete                                                                                                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notifications              | Durable intents exist; `sendNotification` deliberately reports unprovisioned senders. Resend/Twilio sending, delivery callbacks, customer templates and recurring escalations are **not implemented**. The Marketplace workflow could not provision Resend without a domain.                                   |
| Safe delivery cancellation | The adapter does not call a cancellation endpoint whose current account contract has not been established. Active-delivery cancellation enters review; there is no automatic no-courier compensation path yet.                                                                                                 |
| Settlement                 | Future split dates can be scheduled. Actual release/routing and bank settlement correlation remain unverified and unimplemented. The settlement job creates `SETTLEMENT_EVIDENCE_NEEDS_VERIFICATION`; it cannot complete an autonomous order.                                                                  |
| Exceptions                 | Cancellation/refund/issue cases, guarded case resolution/resume and return condition/restock commands exist. Verified chargeback ingestion, private evidence upload/access and merchant recovery accounting still need completion. Unsupported authenticated events correlated to an order hold it for review. |
| Orchestration              | Merchant/checkout/preparation/return deadlines and sweeps exist. All ETA/no-courier/disputed-clearing policies, alert reminders and complete reconstruction of every missing job are not yet implemented.                                                                                                      |
| Admin                      | Queue, timeline, jobs, provider operations, case resolution and refund previews exist. Provider/store health controls, global quarantined inbox tooling, financial evidence and settlement reports need completion.                                                                                            |
| Security/retention         | Owner/session guards, RLS and shared rate limits exist. Staff sessions require reauthentication on expiry. Production credential rotation, hosted grant parity, retention/anonymisation and private evidence handling remain launch gates.                                                                     |
| Legal / pilot              | Current public terms describe validation. Approved trading terms, operator identity, invoicing, coverage, stock/prices, agreements and invitation allowlist must exist before live exposure.                                                                                                                   |
| Tests                      | Local unit/database/transport fixtures and browser checks are separate from real provider acceptance. All 38 exception scenarios and the browser-closed/restart financial happy path are not yet proven.                                                                                                       |

## External state

- Easypay sandbox credentials already exist locally. Marketplace onboarding, authorisation/capture/void/refund/split and actual settlement tests have **not** been performed for this new flow.
- User confirmed no Uber Direct test account, Twilio account or pilot store yet, and no owned sending domain. Do not substitute invented credentials, store data, fees, alcohol approval or payout behaviour.
- Checkly resource `checkly-green-cable` was provisioned after terms acceptance. Email/SMS alert channels and two **paused** checks were created: heartbeat `1803b395-f137-4b01-81b5-dad5ddaea2b5` (60-second period / 120-second grace), health `d99773ae-c39c-4028-bf41-726d56d04cf9` (one-minute HTTP check). Health targets `https://ruvon-website.vercel.app/api/health`; verify the actual deployment origin before activation. Alert delivery is not tested. No active outage coverage is claimed.
- Operator contacts and random worker/rate-limit secrets were saved only to ignored `.env.local`. Checkly credentials and its heartbeat URL remain in ignored `.env.checkly.local`. Values were not committed or logged.
- Resend terms were accepted but resource creation requires `domain` and `region`; provisioning did not complete. No substitute sender was used.

## Phase tracking

| Phase                        | Status                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 0 — provider verification    | Blocked on accounts, domain, store and commercial evidence. Public contracts reviewed; account tests outstanding. |
| 1 — database / state machine | Local implementation and focused tests; hosted parity and complete transition coverage outstanding.               |
| 2 — Easypay                  | Adapter/operation/compensation code and fixtures; account lifecycle and settlement path outstanding.              |
| 3 — merchant automation      | Dashboard, Auth scope, heartbeat and inventory; notification sending and complete workflow outstanding.           |
| 4 — Uber                     | Quote/booking/status/return adapter; real test account, cancellation and eligibility outstanding.                 |
| 5 — durable orchestration    | Local inbox/queue/leases/sweeps; scheduling, all policies and restart acceptance outstanding.                     |
| 6 — exceptions               | Partial implementation; all 38 scenarios are not certified.                                                       |
| 7 — operations / monitoring  | Partial UI; provisioned paused monitors; activation/alerts and remaining controls outstanding.                    |
| 8 — real sandbox acceptance  | Not run. Cannot pass with the current notification/settlement gaps or missing Uber/store access.                  |
| 9 — production pilot         | Not started; live checkout stays disabled.                                                                        |

Continue from this status rather than treating table creation or transport fixtures as phase acceptance. See [provider evidence](PROVIDER-CAPABILITIES.md), [operating runbook](ORDER-OPERATIONS.md), [refund policy](REFUND-POLICY.md) and [pilot gates](PRODUCTION-PILOT.md).

## Local verification

- Production webpack build, TypeScript and ESLint passed. The default Turbopack build encountered the local sandbox port-binding restriction; `npm run build -- --webpack` succeeded.
- Seven production HTTP integration tests passed, including disabled-commerce isolation and the existing validation funnel.
- Two mobile Chrome browser journeys passed: pending-order recovery/cart receipt deduplication/privacy isolation and merchant preparation permission. These use explicit synthetic responses with provider credentials blanked.
- **133 tests across eleven files passed**, including legacy sandbox lifecycle tests against all eleven migrations and the new database/transport/domain/worker tests. No real-provider acceptance is claimed.
- The repository-wide formatting check still flags 24 existing files outside this change; newly added/modified commerce files are formatted. Migrations 001–005 remain unchanged.
