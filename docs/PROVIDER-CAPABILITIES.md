# Provider contracts and evidence

Public contracts reviewed 2026-10-12. **All account-specific capabilities below are NEEDS VERIFICATION.** No capability evidence is inserted by migrations or fixtures into hosted projects. Current implementation limits are in [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md).

## Easypay

Fixed API environments: `https://api.test.easypay.pt/2.0` and `https://api.prod.easypay.pt/2.0`. Authentication uses server-only `AccountId` / `ApiKey`. The Ruvon split beneficiary account is configured separately. Never enable the old sandbox Single Sale endpoints as production contracts.

| Operation            | Contract / identity                                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MB WAY authorisation | `POST /single`, `type: authorisation`, `method: MBW`, EUR total, attempt UUID in `key`; authoritative `GET /single/{id}`.                                                                                                                          |
| Cards                | `POST /checkout`, Single authorisation, `methods: [CC]`; private hosted manifest. `GET /checkout/{id}` resolves `payment.id`; then verify the matching Single authorisation. SDK success is not payment evidence.                                  |
| Capture              | `POST /capture/{single_authorisation_id}`; operation UUID in `transaction_key` and `Idempotency-Key`; immutable total and two snapshotted split allocations. `GET /capture/{capture_id}` verifies the parent, key and split beneficiaries/amounts. |
| Void                 | `POST /void/{single_authorisation_id}`; `GET /void/{void_id}` verifies `authorisation.id` and transaction key. Void identifiers are not Single IDs.                                                                                                |
| Refund               | `POST /refund/{capture_id}`; `GET /refund/{refund_id}` verifies `capture.id`, key and amount. Capture refund lists can recover a lost creation response. Async states remain processing.                                                           |
| Clearing             | `PATCH /capture/{capture_id}/splits/{split_id}`, future `clearing_date`; read capture splits afterwards. No immediate release endpoint is invented.                                                                                                |
| Callback             | Generic notification `{id,key,type,status}` authenticated with configured BasicAuth. Persist a fingerprint including type/status; use matching resource reads in the worker.                                                                       |

The adapter verifies currently authorised funds immediately before creating capture intent. The published `expiration_time` field does not establish an MB WAY/card authorisation lifetime: no arbitrary expiry is invented. A timezone-qualified expiry is retained if actually supplied. Local reservation deadlines are separate from provider expiry facts.

Easypay documents 24-hour idempotency protection. Local uniqueness outlives it. This implementation reconciles a dispatched operation; it does not treat a new lease as permission to repeat a financial POST. A lost void response without a resource relationship remains unknown until a verified callback/read identifies it.

Before enabling a method, retain redacted sandbox evidence for authorisation, capture, void, actual expiry, hosted card authentication, callback duplication/order reversal, lost responses, full/partial refunds, funding requirements and split outcomes. Prove merchant funds cannot clear before delivery and normal payout needs no manual backoffice action. Identify actual bank settlement records separately from successful split routing. Partial split-value reversion, insufficient balances and post-settlement merchant recovery remain unverified.

Sources: [published OpenAPI](https://docs.easypay.pt/_bundle/openapi.json?download), [payment methods](https://docs.easypay.pt/docs/guides/payment-methods), [Checkout](https://docs.easypay.pt/docs/products/checkout), [Generic webhooks](https://docs.easypay.pt/docs/guides/webhooks), [idempotency](https://docs.easypay.pt/pt/docs/idempotency).

## Uber Direct

Use only the DaaS family `https://api.uber.com/v1/customers/{customer_id}`. OAuth uses client credentials at `https://auth.uber.com/oauth/v2/token`, scope `eats.deliveries`. Test/live credentials and `live_mode` must agree with the commerce environment.

- Quotes: `POST /delivery_quotes`, exact structured PT address JSON strings; persist ID, EUR fee, ETA, provider expiry and both address payloads.
- Outbound booking: `POST /deliveries`, persisted operation UUID as `idempotency_key`, order UUID as `external_id`, quote ID, contact and manifest. One local outbound intent is enforced independently of jobs.
- Reads: `GET /deliveries/{del_or_ret_id}`. Delivery creation is not pickup. A `ret_` leg belongs to its original outbound delivery and its delivered status is a return to the store.
- Webhooks: `x-uber-signature`, HMAC-SHA256 over exact raw bytes with a dedicated signing key; verify customer and environment. Persist only references, event time and hash. Worker reads the delivery authoritatively.
- Alcohol: explicit SKU metadata, meet at door, supported `identification.min_age: 18`, return on failed handoff. Retain only verification outcome/time, never document fields. Portugal/account approval is not established.

Verify booking key retention, same-key replay and recovery after lost responses before enabling checkout. This adapter never automatically reposts an unidentified booking. Establish the current cancellation contract, safe timing, reassignment rules, costs and returns with the account; automatic active-delivery cancellation remains disabled until implemented/tested. Robo Courier fixtures and simulation do not prove real Portugal coverage or alcohol eligibility.

Sources: [getting started](https://developer.uber.com/docs/deliveries/get-started), [webhooks](https://developer.uber.com/docs/deliveries/guides/webhooks), [delivery statuses](https://developer.uber.com/docs/deliveries/daas/references/api/webhooks/delivery-status-webhook), [proof of delivery](https://developer.uber.com/docs/deliveries/guides/proof-of-delivery), [FAQ](https://developer.uber.com/docs/deliveries/faq), [Robo Courier](https://developer.uber.com/docs/deliveries/guides/robocourier).

## Notifications and independent monitoring

Resend provisioning requires an owned domain/region; verified sending and actual adapters/callbacks remain outstanding. Twilio credentials, Portuguese sender configuration and SMS tests are missing. No local intent row is evidence of sending or delivery.

Checkly was provisioned with paused heartbeat/health checks and operator email/SMS channels. Activate only after verifying deployment origin, worker scheduling and channel delivery. Independent Checkly alerts must work while the application/database is unavailable. Its ping URL is secret operational configuration, not a public health endpoint.

Sources: [Resend Marketplace setup](https://resend.com/docs/guides/vercel-marketplace-integration), [Portugal SMS guidance](https://www.twilio.com/en-us/guidelines/pt/sms), [Checkly heartbeat monitoring](https://www.checklyhq.com/product/heartbeat-monitoring/).
