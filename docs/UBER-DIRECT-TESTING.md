# Uber Direct sandbox acceptance

Verified carrier-only run 2026-10-25: normal delivery, simulated age verification, customer-unavailable return, authentic signed callbacks, lost-response recovery through a callback plus GET, observation restart and controlled event replay pass. Each scenario used one booking POST and a durable private test intent. Nineteen authentic events were persisted and processed into expected unmatched quarantine; no commercial order/payment fact was fabricated.

An initial signing configuration mistake was corrected by the user, and a fresh run passed with new identities. Earlier tests/evidence were preserved, including recovery through List Deliveries without another POST. This is carrier integration acceptance; it cannot establish a successful paid commerce order, production alcohol approval, real courier availability or verified idempotency retention. The active-delivery cancellation API/policy remains outstanding.

## Webhook prerequisite

In the existing Uber Direct organisation, remain in **Test mode**. Open **Developer → Webhooks → Create Webhook** and select `event.delivery_status` initially. Use the private URL in ignored `.data/uber-direct-sandbox-webhook.txt`. It targets the stable protected Preview's `/api/webhooks/uber-direct` route and includes the existing project protection bypass; do not publish it or paste it into source/issues.

After saving, obtain the webhook's dedicated signing key (available through its Edit action) and save it locally as `UBER_WEBHOOK_SIGNING_KEY`. The three existing credentials remain `UBER_DIRECT_CLIENT_ID`, `UBER_DIRECT_SECRET` and `UBER_DIRECT_CUSTOMER_ID`. No secret value belongs in chat or this document.

The user authorised and configured these four values as sensitive Preview-only settings. The final Preview uses sandbox delivery mode, checkout false, SMS off and blank production database credentials. Repeat the signature/account/environment preflight before future exercises. Production activation requires its separate launch gates; a webhook URL alone is not evidence of readiness.

Immediate callback processing must not ping the external worker monitor. Only successful scheduled invocations acknowledge worker health and send the heartbeat. The carrier exercise exposed monitor rate limiting before this separation; eight additional controlled event replays pass after the deployed correction, without creating new inbox events or jobs.

Verify the signed route, sandbox account/environment, durable inbox and scheduled processing before creating deliveries. Uncorrelated provider-only test events must remain quarantined; never manufacture successful payment facts to make a carrier test appear to be a commercial order.

## Controlled scenarios

Persist each test's identity, immutable request, quote and creation intent before its external mutation. Use public test addresses, synthetic recipient/contact data, one stable booking key and the supplied Test-mode credentials. Record a dispatched/unknown result before recovery; never automatically repost an unidentified booking. Keep these test records separate from commercial order/financial acceptance evidence.

| Scenario        | Exercise                                                                                     | Required evidence                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal delivery | Robo Courier `mode: auto`; meet at door; request the supported age check.                    | One outbound ID, `live_mode: false`, original tracking URL, pickup and delivered observations, matching signed inbox events and authoritative reads. |
| Failed handoff  | Robo Courier `cancel_reason: customer_unavailable`, `undeliverable_action: return`.          | Outbound failure and a separately correlated return leg ending at pickup; a delivered return must not count as customer delivery.                    |
| Cancellation    | Exercise the verified provider cancellation contract at an allowed stage.                    | Confirmed safe terminal status before treating cancellation as complete; unknown remains unresolved.                                                 |
| Recovery        | Interrupt local observation/restart, replay a callback and simulate a lost booking response. | Same operation/delivery identity, no repeated booking, fenced/deduplicated processing and provider reads recovering missed observations.             |

Robo Courier can generate successful verification results in simulation. This does not establish real identity/sobriety handling, Lisbon courier availability, production alcohol eligibility or contractual responsibility. Those require provider confirmation and a supervised real pilot.

Record sanitised provider IDs, statuses, timestamps and inbox outcomes. Retain no credentials, access tokens or identity-document material. Stop on an unexpected live response or ambiguous mutation; reconcile the original operation before proceeding.

Sources: [Uber webhook setup/signatures](https://developer.uber.com/docs/deliveries/guides/webhooks), [Robo Courier scenarios](https://developer.uber.com/docs/deliveries/guides/robocourier), [test credentials](https://developer.uber.com/docs/deliveries/get-started).
