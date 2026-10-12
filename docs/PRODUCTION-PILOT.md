# One-store production pilot

**Not approved or enabled.** The new commerce flow has not passed real sandbox acceptance. Follow [implementation status](IMPLEMENTATION-STATUS.md); do not enable it just because local tests pass.

## Required before sandbox acceptance

- Uber Direct test credentials and approved test customer; Twilio account/Portuguese sender; owned Resend sending domain and provisioned verified resource.
- One real store's pickup/contact details, exact postcode coverage, Lisbon hours, named staff, approved 20–30 SKU prices/stock/compliance and four main pack recipes.
- Verified Easypay marketplace structure, method-specific authorisation/capture/void/refund, split holding, future clearing and actual settlement correlation.
- Complete the missing notification, cancellation, settlement, exceptions and monitoring work listed in the status document.
- Apply/verify 006–011 on the isolated test project; deploy a protected sandbox with durable Cron, real callbacks and sender/monitoring tests.

User has confirmed the Uber/Twilio/store/domain prerequisites are not currently available. No demo store or substitute payment mechanism is included.

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
