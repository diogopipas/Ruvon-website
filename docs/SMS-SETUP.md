# Twilio SMS setup

Updated 2026-10-20. **The operator received an earlier Console trial SMS. Operational Ruvon SMS remains disabled and has not passed provider acceptance.** The durable adapter, signed inbox and recovery reads are deployed to the protected Preview; migration 015 is applied only to the isolated sandbox. No Twilio credentials have been uploaded to Vercel or production, and no paid activation or number purchase is authorised.

## Actual transport evidence

Authenticated reads confirm an active Trial account and a locally saved E.164 `TWILIO_FROM_NUMBER`. The owned-number lookup and Messaging Services list are empty; this does not establish that provider-supplied trial transport is unavailable.

A read-only Messages query found a prior message sent at **21:59:52 Lisbon on 20 October**, marked `delivered`, without a delivery error. Account, recipient and saved sender match. The user confirmed receipt. This Console test predates Ruvon's probe; it is not a worker-generated message or an order notification.

The separately authorised, exactly-one probe at **22:39:37 Lisbon** used `To` and `Body=sms_internal_alerts`. Twilio rejected that POST with HTTP 403/code `572003`, without a Message SID. Its cause is unverified. The private intent remains `provider_rejected`, with one attempt; never delete it or repeat the consumed authorisation. Monitor diagnostics returned 401 and the legacy Notifications endpoint returned 404. The received earlier message proves that particular trial route worked; it does not explain the later API rejection.

The SMS trial guide restricts content to predefined templates. These cannot replace merchant reminders or actionable operator alerts. The general and SMS-specific trial guides describe different destination restrictions; actual receipt is account-specific evidence, not approval of unrestricted Portuguese transactional SMS. [SMS trial guide](https://www.twilio.com/docs/usage/trials/try-out-sms), [trial overview](https://www.twilio.com/docs/usage/trials).

Private evidence lives in ignored `.data/`, including `twilio-oct20-confirmed-receipt.json` and `twilio-oct20-trial-probe.json`. The probe intent contains the destination; never commit, upload or paste it into a ticket. No commerce order, store, capability or notification row was created for either diagnostic.

## Implemented operational path

- `RUVON_SMS_ENABLED` defaults to false. New custom messages require an authenticated **Full/active** account and exactly one configured From number or Messaging Service. Trial accounts are rejected before the dispatch grant. This gate does not perform an upgrade.
- The database freezes one private request and grants one POST per notification. There is no assumed Twilio creation idempotency window. A crash or unknown response cannot authorise another POST.
- That transaction schedules reads at 30 seconds, 2/5/15 minutes, 1 hour and 24 hours. The sweep reconstructs those same identities without resetting failed work or leases. A known Message SID is read authoritatively; an unknown SID is never guessed from similar historical messages.
- `POST /api/webhooks/twilio` verifies HMAC-SHA1 over the public URL and every decoded form parameter before database lookup. The callback URL must equal the frozen request. The inbox stores only notification/resource references and a hash. The worker checks account, environment, recipient, sender/service and message content through the provider GET. [Message API](https://www.twilio.com/docs/messaging/api/message-resource), [signature validation](https://www.twilio.com/docs/usage/security).
- Fenced outcomes resist stale workers, duplicate callbacks and state regression. Conflicting terminal facts are quarantined. Unresolved delivery stays unknown, never a locally invented failure. Disabling new SMS does not disable existing reads or signed callback recovery.

Merchant reminders remain due 60 seconds after verified authorisation; open operator cases escalate after five minutes. Short messages link to authenticated dashboards and contain no customer name, address or contents. Notification outcomes never change payment or delivery facts.

## Remaining activation and acceptance

Custom-content eligibility, Portuguese sender/routing and a correlated order's actual delivery still need verification. No paid upgrade is authorised. Before explicitly enabling SMS, configure credentials, operator/store recipients and `TWILIO_STATUS_CALLBACK_URL` on the correct environment; protected previews require their private automation query in that URL. Keep it secret. Then exercise real correlated create/read/callback delivery and operator receipt, including lost responses and worker restart. Additional diagnostic sends require a new explicit instruction. Local fixtures, the received Console test and migration parity do not approve the notifications launch capability.
