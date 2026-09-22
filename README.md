# Jola

**Acabou a bebida? Nós levamos.** A working demand-validation MVP for a Portuguese drinks-and-party delivery concept. It has a full simulated ordering experience, local persistence for development, Supabase persistence for deployment, and a protected demand dashboard. It does not sell alcohol, take payments, book deliveries or send messages.

## Run locally

Requires Node.js 22.12+ and npm.

```bash
npm ci
cp .env.example .env.local
```

Set `ADMIN_PASSWORD` to at least 12 characters. Keep `JOLA_LOCAL_DEMO=true` to test without Supabase, then:

```bash
npm run dev
```

Open **http://localhost:3000**. The dashboard is **http://localhost:3000/admin**.

In this prepared workspace, `.env.local` already enables local storage and sets the local-only dashboard password to `jola-local-2026`. Replace it before deployment; it is not a production default in the code.

Local records persist in `.data/jola.json`, which is excluded from Git. A successful local submission really writes the lead, basket and attribution to disk. The dashboard labels these records as local demonstration data. Test contacts use `example.com` and no notifications are sent. To start a clean local dataset, stop the server and move `.data/jola.json` to a backup filename. Browser state is separate: use a private window for a new funnel or clear the `jola_*` local-storage entries.

## What is implemented

- Mobile-first branded homepage with custom photography-inspired hero, category cards, four party packs, how it works, launch cities, merchant form and FAQ.
- `/pedir`: 32 demo products, filters in the URL, search, quantity controls, feedback toasts, sticky desktop cart and floating mobile cart.
- `/checkout`: basket review → city/postcode → launch invitation → email or Portuguese phone → persisted confirmation and optional native sharing.
- Initial age confirmation, saved locally; negative response blocks the catalogue.
- `/admin`: signed, HTTP-only password session; visitors, CTA clicks, started orders, checkout attempts, leads, simulated GMV, average basket, conversion, product/category selections, geography, campaigns and merchant interests.
- Server validation, canonical prices, atomic/retry-safe lead capture, origin checks, request-size limits, honeypot and basic rate limiting.
- Local fonts, optimized WebP, branded OpenGraph image, sitemap, metadata, accessible dialogs, focus treatment and reduced-motion support.

All product-facing copy is European Portuguese. Prices, ETA and products are clearly marked as previews. The chat example is explicitly fictional. There are no invented testimonials, operational claims or analytics numbers.

## Supabase setup

1. Create a Supabase project.
2. Open its SQL editor and run [supabase/migrations/001_jola.sql](supabase/migrations/001_jola.sql), or apply it through your Supabase CLI workflow.
3. Set the server-side variables:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
ADMIN_PASSWORD=YOUR_LONG_RANDOM_PASSWORD
NEXT_PUBLIC_SITE_URL=https://YOUR_DEPLOYED_DOMAIN
NEXT_PUBLIC_CONTACT_EMAIL=YOUR_REAL_PRIVACY_CONTACT
JOLA_LOCAL_DEMO=false
```

4. Restart the server and submit an `example.com` test contact.
5. Confirm the dashboard displays **Ligado ao Supabase** and both `leads` and `simulated_orders` contain the test session.

The service-role key must never use a `NEXT_PUBLIC_` prefix. Browser code only calls the application's server routes. RLS is enabled with no anonymous or authenticated policies. Table and RPC access is granted only to `service_role`. `capture_lead` stores the lead and basket in one transaction; unique session IDs make retries idempotent. Merchant interests are separate.

**Supabase credentials were not supplied for this workspace.** The full local flow and PostgreSQL migration were tested; a live Supabase connection still needs the configuration above. Missing production storage returns a retryable error instead of a fake success. Local JSON storage is explicitly disabled on Vercel.

## Deploy on Vercel

1. Import this Git repository into Vercel. Select the Next.js preset and Node.js 22.
2. Configure the environment variables above for the intended environment. Keep preview and production Supabase datasets separate.
3. Build command: `npm run build`; install command: `npm ci`. No custom output directory is needed.
4. Deploy. After choosing the domain, set `NEXT_PUBLIC_SITE_URL` to that origin and redeploy so metadata is correct.
5. Complete the [QA checklist](docs/QA.md) against the deployment with a synthetic contact, then verify the Supabase rows and protected dashboard.

Before inviting public traffic, add the actual operator identity, privacy contact and retention period to `app/privacidade/page.tsx`, and confirm the final promotional terms. These business details cannot be inferred from the brief. The UI currently describes its prelaunch status honestly. The supplied contact variable populates a direct privacy contact if configured.

The application is prepared for Vercel; no public deployment was made as part of this implementation.

`NEXT_PUBLIC_SITE_URL` should include `https://`. Bare hostnames are normalized, and Vercel deployments automatically fall back to `VERCEL_PROJECT_PRODUCTION_URL` or `VERCEL_URL`. A localhost value is ignored on Vercel so it cannot break OpenGraph metadata or the sitemap.

## Verification

```bash
npm test                 # Domain validation + real PostgreSQL-engine migration tests
npm run lint
npm run typecheck
npm run build
npm run test:e2e          # Production server/API integration suite; build first
```

The integration suite starts an isolated production server on port 3100, writes only to `.data/integration`, and uses synthetic contacts. It tests the full stored funnel, server price authority, origin and validation boundaries, retry safety, login/logout, dashboard privacy, merchant separation and public routes/OG rendering. It does not automate a browser. The 390 px browser journey was verified manually in Safari; see [QA notes](docs/QA.md).

PostgreSQL tests use PGlite, a local PostgreSQL engine. They run the migration with only the optional `pgcrypto` extension declaration omitted, since `gen_random_uuid` is already available in the engine. No external database or credentials are needed for these tests.

## Architecture

```text
app/                  Next.js App Router pages, metadata and API routes
components/landing/   Homepage interactions and forms
components/ordering/  Search, category filtering and product cards
components/cart/      Cart review, quantities and mobile drawer
components/checkout/  Location, contact, success and sharing
components/admin/     Login and dashboard controls
components/ui/        Shared accessible dialogs, navigation and product artwork
components/providers.tsx  Persistent cart, age gate and feedback
lib/products.ts       32 products + 4 bundles; authoritative local catalogue
lib/pricing.ts        Integer-cent arithmetic shared by server and client
lib/analytics.ts      Attribution capture and provider-neutral event transport
lib/validation.ts     Shared Zod boundaries
lib/server/           Supabase/local storage, auth and request handling
lib/dashboard.ts      Documented metric aggregation
supabase/migrations/  RLS, indexes and transactional capture functions
tests/                Domain, PostgreSQL and server integration tests
docs/                 Analytics, manual QA, design and asset provenance
```

The stack is Next.js 16, React 19, strict TypeScript, Tailwind CSS 4, Lucide, Framer Motion and Supabase. Dialogs use Radix, the accessible primitive used by shadcn/ui, with Jola's own styling. The server renders the landing content and dashboard; only interactive sections hydrate. No CMS, accounts, payment, delivery, merchant dashboard or inventory systems are included.

## Metric definitions and operating limits

- Money in TypeScript and PostgreSQL is **integer euro cents**. Analytics `basket_value` is euro units; it excludes fees.
- One anonymous identifier is persisted per browser profile. “Visitors” means unique identifiers with a landing view, not unique people. Direct catalogue entrants may start an order without a landing event.
- One simulated order per identifier is created after the first item is added. Clearing the cart preserves the started-order record. A converted order remains converted after later edits.
- GMV sums current nonempty order totals, including fees. Average basket excludes fees and empty baskets.
- Order-to-lead conversion uses converted order sessions / started order sessions. City-only waitlist leads count in the lead total but do not inflate order conversion.
- Product/category charts count additions, including re-additions. Packs count as packs; they do not inflate individual-product selections.
- Geography combines orders and leads and deduplicates by session within each city/postcode.
- Campaigns use the latest explicitly tagged visit, persisted until replaced by another tagged visit. Untagged navigation preserves attribution. Source, medium, campaign and content are stored.
- Analytics delivery is best effort. Contact and order saves report errors and can be retried; analytics loss does not prevent using the product. There is no advertising pixel configured.
- Request limits are in-process and suitable for an MVP; use a shared rate limiter or Vercel firewall rules when traffic scales. The dashboard pages through all stored rows and aggregates on the server; use SQL aggregation when volume justifies it.
- Local disk storage is intended for one local server process. Use Supabase for multi-instance deployments.

More detail: [analytics events](docs/ANALYTICS.md), [QA](docs/QA.md), [design and generated asset](docs/DESIGN.md).
