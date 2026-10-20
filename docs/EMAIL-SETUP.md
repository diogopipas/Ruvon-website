# Transactional email setup

Updated 2026-10-13. **The real sender, hosted signed callbacks and callback replay are verified in the protected sandbox. Email code/tables are deployed; complete order notification acceptance remains outstanding.** The user chose a free direct Resend account; no paid Marketplace subscription was created.

## Verified

- `ruvon.store` is owned by the project's Vercel team and is registered with Vercel.
- Both `ruvon.store` and `www.ruvon.store` are linked to `ruvon-website`.
- Authoritative nameservers are `ns1.vercel-dns.com` and `ns2.vercel-dns.com`.
- The existing website aliases and CAA records were preserved. The exact Resend records were added: `resend._domainkey` TXT (public DKIM key), `rsend` CNAME → `rsend-euw1.forge.rmta.net`, and `send` CNAME → `send.forge.rmta.net`. No root MX record was added; receiving remains disabled.
- Marketplace discovery lists only paid Resend plans (Pro USD 20/month, Scale USD 90/month). The user explicitly selected the free account/API alternative. No subscription was created.
- Resend domain `aa290aac-0894-4c34-a2ba-4923b678af40` is **Verified** in Ireland (`eu-west-1`). Tracking metrics are not configured.
- The user created `ruvon-server` with Sending access. The credential stays in ignored `.env.local` and is stored as a sensitive secret in Vercel Preview. Production is not configured. Vercel Development cannot store a sensitive secret, so the local file is used there; no readable key was uploaded.
- Sender: `Ruvon <pedidos@ruvon.store>`. Reply-to: the monitored operator Gmail address. Domain ownership does not create a mailbox at `pedidos@ruvon.store`.
- A synthetic message to the operator was accepted and shown as **Delivered** in Resend. Provider ID: `01a1369a-038c-7c13-b6d5-ba3e79c80cf2`. Repeating the identical request/key returned that same ID; the dashboard showed one email. This confirms delivery to the recipient's mail server, not reading or inbox placement.
- Private test receipt: `.data/resend-verification.json` (ignored). No secret was printed or committed.

## Implemented and deployed to the protected sandbox

- Fixed-destination Resend HTTP adapter with bounded requests and stable `Idempotency-Key`.
- Private notification records freeze one request before dispatch. Job leases fence completion; uncertain sends replay only inside a conservative 23-hour window. Expired uncertainty requires reconciliation, never a fresh key.
- Portuguese merchant, preparation, customer status/refund and operator email templates. Messages omit customer address, phone and pack details; staff links require authentication and customer links retain device ownership checks.
- Customer email jobs commit with order events. Open cases receive deduplicated 30-minute reminder jobs; SMS is still unprovisioned.
- `/api/webhooks/resend` verifies exact raw bytes using the documented Svix HMAC contract and a five-minute timestamp tolerance. The durable inbox stores only status/references and processes duplicate/out-of-order callbacks without regressing delivery to API acceptance.
- Named-admin order detail shows notification outcomes without exposing request bodies or recipients.
- Unit/database checks cover provider requests, uncertainty, Unicode signatures, the published Svix test vector, stale leases, frozen payloads, callbacks, RLS and recurring alert deduplication.

## Hosted callback evidence

Migrations 006–011 are applied to `pdabphxqkszajvxilxat`. The protected [sandbox preview](https://ruvon-sandbox-diogos-projects-f6903add.vercel.app) is READY with its 30-second Vault-authenticated Cron worker. Production is unchanged and checkout remains disabled.

The user created Resend webhook `14ab5e82-2daf-4573-8169-5e8ee0e9f664` for the seven requested event types and saved its signing key locally. With explicit authorization, `RESEND_WEBHOOK_SECRET` is now stored as a sensitive Vercel Preview secret. The private setup URL uses Vercel automation authentication; keep the URL/query and signing key out of source control, logs and public documents. The application still independently requires the exact-byte Resend signature.

A second synthetic operator email (`01a136dc-ff51-7824-a65e-59fe20e488b1`) produced one provider ID across an identical-key replay. Authentic `email.sent` and `email.delivered` callbacks received HTTP 200 in Resend, were verified and durably stored, and both background jobs succeeded. Replaying the delivered callback received 200 without another inbox row/job. An unsigned POST returns 401.

The synthetic email deliberately has no order notification ID. Its two events are quarantined as `UNMATCHED_NOTIFICATION`; this proves authentication, persistence, processing and deduplication without inventing an order. It does not certify customer/merchant notification state updates. Receipt/evidence files are private under ignored `.data/`.

## Remaining activation steps

1. Test durable merchant/customer/operator notifications correlated to a real sandbox order, including lost dispatch responses and stale leases. Real store/staff/provider prerequisites are still missing.
2. Verify Twilio configuration/SMS delivery, independent alerts and outage/recovery before marking the database `notifications` capability verified. The sender/callback tests alone do not satisfy that launch gate.
3. Provision separate production sending credentials/webhook when the remaining launch gates pass. Do not reuse the sandbox signing key in production. Keep sender, domain, reply address and deployment HTTPS site URL explicit.

Preview variables were pulled into ignored `.env.vercel-preview.local` for verification, preserving `.env.local`. Vercel returns `[SENSITIVE]` placeholders for secrets; this downloaded file must not replace the working local credentials.

The checkout exposure flag stays disabled. Email domain ownership alone does not satisfy the payment, delivery, stock, worker or settlement launch gates.

Sources: [verified domains](https://resend.com/docs/dashboard/domains/introduction), [send email](https://resend.com/docs/api-reference/emails/send-email), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests).
