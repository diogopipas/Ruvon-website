# One-store production pilot

**Not approved or enabled.** The new commerce flow has not passed real sandbox acceptance. Follow [implementation status](IMPLEMENTATION-STATUS.md); do not enable it just because local tests pass.

## Required before sandbox acceptance

- Uber Direct test credentials and approved test customer; a provisioned Twilio Portuguese SMS route with verified transactional content and destination; deployed Resend callbacks and durable notification tests. The free Resend account/domain are configured; a synthetic operator email was delivered.
- One real store's pickup/contact details, exact postcode coverage, Lisbon hours, named staff and approved SKU prices/stock/compliance. The user selected a craft-beer A.M.O. pilot: the user has supplied three 33 cl bottle names/prices (450/400/400 cents, VAT included), but stock and compliance/transport details are still missing. The earlier indicative variety count is not an approved assortment. Build packs only from confirmed SKUs; agree the final smaller assortment before launch rather than filling the original 20–30 SKU target with invented products.
- Verified Easypay marketplace structure, method-specific authorisation/capture/void/refund, split holding, future clearing and actual settlement correlation.
- Complete the missing notification, cancellation, settlement, exceptions and monitoring work listed in the status document.
- Hosted 001–015 schema/grant parity, protected Preview, 30-second Cron, real Resend callback/replay transport and worker heartbeat now pass. Complete correlated order notifications, external alert delivery/outage tests and real payment/delivery/settlement acceptance.

On 20 October the user reported that Uber will contact them in 1–3 days, supplied provisional A.M.O. Brewery details and chose a craft-beer pilot. The Twilio Console accepts the user's Portuguese number and a From value is saved locally. One explicitly authorised fixed-template test was rejected with HTTP 403/code 572003, without a Message SID. A read-only query also found an earlier Console SMS marked delivered, and the user confirmed receipt. That proves this trial transport worked, separately from the rejected probe. Default-disabled durable SMS and signed callbacks are implemented; custom-content/routing and correlated Ruvon delivery remain unverified. No repeat, paid upgrade or Twilio secret transfer occurred. Three bottle names/prices and revised pickup windows are recorded; stock, compliance/transport metadata, pickup contacts, postcodes and commercial agreement remain unconfirmed. The user confirmed the combined pickup schedule and Sunday closure. See [A.M.O. preparation](PILOT-AMO.md) and [SMS setup](SMS-SETUP.md). The domain prerequisite is resolved by the purchase of `ruvon.store`; the Resend sender is verified and tested; hosted callback transport/replay now pass; correlated order email acceptance and SMS remain outstanding. No demo store or substitute payment mechanism is included.

## Required acceptance evidence

Record a redacted order/attempt/capture/delivery/split/settlement identity chain showing checkout → authorisation → authenticated merchant acceptance → one capture → one outbound test delivery → pickup/delivery → automatic clearing → actual settlement evidence → completed, with **zero admin commands**. Repeat with browser closure, worker restart, duplicate/out-of-order callbacks and lost provider responses. Synthetic transport/browser fixtures are not this evidence.

Exercise all 38 scenarios from the implementation plan and record automatic or approved review outcomes. Verify parallel reservation/refund limits, cross-store/admin isolation, no unattended alcohol, failed handoff returns, callback retries after database outage and external alerts during application/worker/database outage.

## Production activation

1. Confirm credential rotation, backups/recovery, migration parity, commercial hosting, invoicing and approved legal/operating/merchant agreements.
2. Configure production provider accounts, verified store settings, contacts and independent monitoring. Use production-only secrets and no copied test transactions.
3. Deploy with exposure disabled; verify jobs/callbacks/compensation and monitored endpoints first.
4. Obtain production alcohol/coverage/ID/return and PSP clearing/payout evidence; record expiring verified capability evidence. Implement an invitation allowlist before enabling invited customers (currently outstanding).
5. Run supervised low-value purchase, rejection, timeout, void, refund, delivery and settlement-cycle tests. Only then enable the allowlisted one-store pilot, at most three concurrent active orders.
6. Observe at least twenty successful orders across trading periods and at least one actual merchant settlement cycle before broadening access.

Rollback only checkout exposure. Preserve schema, operation identities, inbox/jobs and money history; finish outstanding compensation and physical recovery. Do not use rollback to abandon held funds or return legs.
