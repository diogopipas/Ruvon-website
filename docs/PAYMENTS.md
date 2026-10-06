# MB WAY sandbox

The Jola catalogue and configurable packs remain authoritative. This integration is **sandbox only**: the provider URL is fixed to `https://api.test.easypay.pt/2.0`; production deployments return 404 for all payment endpoints, even if `JOLA_PAYMENTS_MODE=sandbox` is mistakenly set. The normal production checkout still collects launch interest.

## Credentials and setup

1. Create your own [Easypay sandbox account](https://id.test.easypay.pt/en/signup). In Developers → Configuration API 2.0, select the payment account. Record its **AccountId** and create an **ApiKey** with `single:create` and `single:read` access. AccountId identifies the payment account; it is not the API key's identifier. Use your own account, not the public example credentials in the documentation.
2. Create a separate Supabase test project. Apply migrations 001–005 in filename order **to that test project**. The new migration is [005_mbway_sandbox.sql](../supabase/migrations/005_mbway_sandbox.sql). Do not apply test transactions or replace the existing production database's configuration.
3. Append the following server-only variables to the ignored `.env.local`. Keep the production Supabase values unchanged; the application switches all storage to the explicit test project in sandbox mode. Blank/incomplete/identical-to-production test configuration fails closed, with no local-JSON fallback.

```dotenv
JOLA_PAYMENTS_MODE=sandbox
EASYPAY_ACCOUNT_ID=YOUR_SANDBOX_PAYMENT_ACCOUNT_ID
EASYPAY_API_KEY=YOUR_SANDBOX_API_KEY
EASYPAY_WEBHOOK_USERNAME=YOUR_WEBHOOK_USERNAME
EASYPAY_WEBHOOK_PASSWORD=YOUR_RANDOM_PASSWORD_AT_LEAST_32_CHARACTERS
JOLA_SANDBOX_SUPABASE_URL=https://YOUR_TEST_PROJECT.supabase.co
JOLA_SANDBOX_SUPABASE_SERVICE_ROLE_KEY=YOUR_TEST_SERVICE_ROLE_KEY
```

The webhook username/password are **Jola's callback authentication**, not your Easypay login password or ApiKey. Initial values were generated in `.env.local` during implementation if they were absent. Configure the same values in the provider's notification BasicAuth settings; don't print or commit them. None of these variables may have a `NEXT_PUBLIC_` prefix. Keep drafts and test contacts synthetic.

4. Restart `npm run dev`. Add products to the catalogue and open `/checkout`. Sandbox carts are stored separately from normal carts. The first button, **Rever pagamento**, obtains the server quote and establishes the HttpOnly cookie without charging. The next button, **Pagar {total} com MB WAY**, creates a Single Sale request. Phone is required; email is optional; city only, no postcode. Customers are not enrolled in the waitlist. `?interesse=1` retains the interest-only form against the test dataset.
5. On Vercel, use a dedicated protected **Preview branch** (`codex/mbway-sandbox`), with these variables scoped to that branch's Preview environment. With Vercel CLI 62.5.0, use `vercel env add <NAME> preview --git-branch codex/mbway-sandbox --project jola-website --scope diogos-projects-f6903add --sensitive`, supplying the value through stdin. Keep `JOLA_PAYMENTS_MODE=disabled` in Production. Redeploy the preview after setting variables. Upgrade older CLIs with `npm i -g vercel@latest`. `.vercelignore` excludes environment files and local datasets from deployment uploads.

The Vercel Marketplace refused the Free Supabase resource with `Billing plan is disabled: free (400)`; it did not create a test database. Direct Supabase provisioning is the fallback. Supabase permits two active Free projects across organizations owned/administered by the account, so a separate free test project needs an available slot. Do not pause another application, upgrade a plan or reuse Jola's production database to bypass this restriction without the owner's explicit decision. See [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase).

## Webhook configuration

In the sandbox account's Developers → Configuration API 2.0 → Notifications, configure **Generic** notifications to:

```text
https://YOUR_PREVIEW_ORIGIN/api/webhooks/easypay
```

Use HTTPS and configure HTTP Basic authentication with `EASYPAY_WEBHOOK_USERNAME` / `EASYPAY_WEBHOOK_PASSWORD`. Only Generic Single Sale authorisation/capture notifications are used; do not point the provider's differently shaped Transaction or Authorisation notifications at this route. We deliberately do not infer payment from the callback's status or customer fields.

For a protected Vercel preview, create a dedicated automation bypass secret and append `?x-vercel-protection-bypass=YOUR_BYPASS_SECRET` to the provider's webhook URL. Keep this URL private; it contains a secret. The bypass permits delivery through Vercel's protection; application BasicAuth and provider verification are still mandatory. See [Vercel's webhook bypass documentation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

The handler validates authentication and the bounded JSON body, resolves the already-persisted attempt by merchant key, reads `/single/{id}` using the server's sandbox account credentials, and verifies UUID, merchant key, EUR amount and MBW method. It saves the result transactionally before replying 200. Transient provider/storage failure returns 503 so Easypay can redeliver. Repeated or out-of-order notifications cannot undo a confirmed paid order.

## State and retry rules

- Quotes contain the complete configured product snapshot and integer-cent prices, including €2.99 delivery and €0.89 service. Browser-supplied totals are rejected. A quote cannot change after creation.
- An order UUID identifies one purchase; the anonymous analytics session never authorizes payments. A random 256-bit HttpOnly, Secure-on-hosted-deployments, SameSite=Strict cookie authorizes order creation/status/payment. Only its SHA-256 hash is stored. No API response includes credentials, full phone numbers, owner hashes or provider messages.
- Attempt UUIDs are the provider merchant key, capture transaction key and `Idempotency-Key`. The attempt is committed before contacting Easypay. A database lock/unique index allows only one creating/pending/reconciling attempt per order across tabs/function instances.
- An API creation response `status=ok` is not proof of payment. `paid` requires an authenticated provider GET with matching identifiers, method, currency and total and `payment_status=paid`. Authorised funds remain pending.
- The UI polls while visible and resumes the same order after a refresh. A database lease limits upstream reconciliation to once per 10 seconds. Webhooks are the primary update path and bypass the polling lease.
- Timeouts/HTTP 500/ambiguous results stay **A confirmar pagamento**. Reconciliation can locate the resource by the persisted merchant key if the creation response was lost. An empty result is not proof of failure. There is no blind POST replay and no new attempt until failure is authoritative; this avoids reusing a key after Easypay's 24-hour retention window. If uncertainty persists, verify the merchant key in the sandbox backoffice; this release provides no manual override or live-payment admin tool.
- Provider-confirmed failure/expiry permits an explicit retry with a new attempt key and the same immutable quote. A local timer alone never marks an order expired. The real MB WAY sandbox returned `payment_status=timeout` after the pending scenario: this is treated as expiry only with one failed capture for the exact complete order value; without that evidence it remains reconciling. Successful payment removes only matching purchased quantities/configurations from the sandbox cart, recording the receipt and remaining cart atomically in one localStorage entry.
- All sandbox storage uses the separate test project, outside production validation KPIs. Meta Pixel, Vercel Analytics and Speed Insights are omitted in sandbox mode. Test payment orders never enter `leads` or `simulated_orders`.

## Verification

Official [sandbox MB WAY numbers](https://docs.easypay.pt/docs/guides/payment-methods):

| Scenario   | Number      |
| ---------- | ----------- |
| Authorized | `911234567` |
| Failed     | `917654321` |
| Declined   | `913456789` |
| Pending    | `919876543` |

Use these synthetic numbers, not your real MB WAY number. A successful create can initially return pending; wait for the asynchronous provider result.

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

The payment suite runs the actual Supabase client and payment migration against a local PostgreSQL engine, with controlled provider transport fixtures. It covers custom-pack price authority, private order ownership, concurrent starts, lost responses, HTTP 500, verified/forged/duplicated callbacks, immutable quotes, terminal paid state, explicit retries, database isolation and production lockout. These automated fixtures are not a claim that your hosted integration has been verified.

Implementation checks: 92 unit/database tests, six HTTP integration tests, typecheck and lint passed. The production build passed using `npm run build -- --webpack`; Turbopack's CSS subprocess could not bind a local port in the restricted agent environment. The user's real Easypay sandbox account accepted four synthetic €6.00 Single Sale requests: the asynchronous GET results were paid, failed, failed and pending for the four numbers above. The pending case subsequently returned timeout with a failed full-value capture. Lookup by merchant key recovered each of the same four resource IDs without another POST. Mobile layout, configured pack contents and the missing-test-database guard were checked at 390 px. No hosted database or callback delivery has been verified yet.

After setting up the real test database and webhook, run the four scenarios through the application, verify matching `payment_orders` / `payment_attempts` in the test project, reload while pending, and confirm the cart is cleared once on success. Confirm the live production waitlist is unchanged. Database persistence and hosted webhook delivery must pass before considering the sandbox complete. Commercial activation is a separate delivery: live credentials/contract, actual delivery addresses/operations, invoicing and refunds are not enabled here.

Provider references: [Single Sale creation](https://docs.easypay.pt/pt/openapi/single-payment/single-post), [authoritative payment status](https://docs.easypay.pt/pt/openapi/single-payment/single-id-get), [notifications](https://docs.easypay.pt/docs/guides/webhooks), [idempotency](https://docs.easypay.pt/docs/idempotency).
