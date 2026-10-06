# Jola

**Acabou a bebida? Nós levamos.** A working demand-validation MVP for a Portuguese drinks-and-party delivery concept. It has a full simulated ordering experience, local persistence for development, Supabase persistence for deployment, and a protected demand dashboard. It does not sell alcohol, accept live payments, book deliveries or send messages.

An opt-in **Easypay MB WAY sandbox checkout** is also implemented. It uses the real test API, immutable server-priced orders, private cookies and verified webhooks; it moves no money and books no delivery. The public production checkout remains a waitlist. See [MB WAY setup and verification](docs/PAYMENTS.md).

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

Keep real credentials in the ignored `.env.local` file or your hosting provider's environment settings. `.env.example` contains placeholders only. The application has no default admin password.

Local records persist in `.data/jola.json`, which is excluded from Git. A successful local submission really writes the lead, basket and attribution to disk. The dashboard labels these records as local demonstration data. Test contacts use `example.com` and no notifications are sent. To start a clean local dataset, stop the server and move `.data/jola.json` to a backup filename. Browser state is separate: use a private window for a new funnel or clear the `jola_*` local-storage entries.

## What is implemented

- Mobile-first branded homepage with a photographic hero, four primary packs, product categories, how it works, launch cities, merchant form and FAQ.
- `/pedir`: six validation packs and 32 individual products, sticky search/categories, filters in the URL, accent-insensitive search, selected-item states, 44 px quantity controls, sticky desktop cart and floating mobile cart.
- `/checkout`: basket review → city selection → transparent early-access invitation → email or Portuguese phone → persisted confirmation and optional native sharing. Progress belongs to the basket/city; contact drafts stay in tab-scoped session storage.
- Initial age confirmation, saved locally; negative response blocks the catalogue.
- `/admin`: signed, HTTP-only password session; visitors, CTA clicks, started orders, checkout attempts, leads, simulated GMV, average basket, conversion, product/category selections, geography, campaigns and merchant interests.
- Server validation, canonical prices, atomic/retry-safe lead capture, idempotent merchant submissions, bounded network requests, origin checks, request-size limits, honeypot and basic rate limiting.
- Local fonts, optimized WebP, branded OpenGraph image, sitemap, metadata, Vercel Web Analytics page views, accessible dialogs, focus treatment and reduced-motion support.

All product-facing copy is European Portuguese. Prices, ETA and products are clearly marked as previews. The chat example is explicitly fictional. There are no invented testimonials, operational claims or analytics numbers.

## Supabase setup

1. Create a Supabase project.
2. Apply the SQL migrations in filename order: [001_jola.sql](supabase/migrations/001_jola.sql), [002_preserve_lead_basket.sql](supabase/migrations/002_preserve_lead_basket.sql), [003_city_only.sql](supabase/migrations/003_city_only.sql), then [004_pack_analytics_events.sql](supabase/migrations/004_pack_analytics_events.sql). Existing installations need any migrations they have not yet applied. Migration 004 permits pack browsing and customization events in production; apply it to the existing Supabase project to stop those event writes returning 503.
3. Set the server-side variables:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
ADMIN_PASSWORD=YOUR_LONG_RANDOM_PASSWORD
NEXT_PUBLIC_SITE_URL=https://YOUR_DEPLOYED_DOMAIN
NEXT_PUBLIC_CONTACT_EMAIL=YOUR_REAL_PRIVACY_CONTACT
JOLA_OPERATOR_NAME=YOUR_ACTUAL_LEGAL_NAME_OR_COMPANY
JOLA_RETENTION_MONTHS=12
JOLA_LOCAL_DEMO=false
```

4. Restart the server and submit an `example.com` test contact.
5. Confirm the dashboard displays **Ligado ao Supabase** and both `leads` and `simulated_orders` contain the test session.

The service-role key must never use a `NEXT_PUBLIC_` prefix. Browser code only calls the application's server routes. RLS is enabled with no anonymous or authenticated policies. Table and RPC access is granted only to `service_role`. `capture_lead` stores the lead and basket in one transaction; unique session IDs make retries idempotent. Merchant interests are separate.

The full local flow and PostgreSQL migrations are tested without touching production data. Live Supabase and hosted Vercel behavior still require deployment verification. Missing or partial production storage configuration returns a retryable error; local JSON storage is disabled on Vercel.

**Credential rotation required:** an earlier commit contained a service-role key in `.env.example`. The template is now blank, but the old value remains in Git history. Revoke/rotate that credential in Supabase and replace it in Vercel and `.env.local`; do not reuse it. No credential was rotated by this code change.

## Deploy on Vercel

1. Import this Git repository into Vercel. Select the Next.js preset and Node.js 22.
2. Configure the environment variables above for the intended environment. Keep preview and production Supabase datasets separate.
3. Build command: `npm run build`; install command: `npm ci`. No custom output directory is needed.
4. Deploy. After choosing the domain, set `NEXT_PUBLIC_SITE_URL` to that origin and redeploy so metadata is correct.
5. Complete the [QA checklist](docs/QA.md) against the deployment with a synthetic contact, then verify the Supabase rows and protected dashboard.

Before inviting public traffic, set `JOLA_OPERATOR_NAME` to the real person or company responsible and `NEXT_PUBLIC_CONTACT_EMAIL` to an inbox you control, then rebuild. A brand name alone is not the operator identity. If the project is operated personally, use your actual legal name; do not invent a company or mailbox. See [launch requirements](docs/LAUNCH.md).

The privacy page contains a proposed 12-month prelaunch retention policy, configurable through `JOLA_RETENTION_MONTHS` (1–24). Set up a recurring deletion/anonymisation process before collecting public contacts; this MVP does not automatically purge records. Confirm your hosting/database region and processing terms.

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

The integration suite starts an isolated production server on port 3100, writes only to `.data/integration`, and uses synthetic contacts. It tests the full stored funnel, server price authority, origin and validation boundaries, retry safety, login/logout, dashboard privacy, merchant separation, production payment lockout and public routes/OG rendering. It does not automate a browser. The 92 unit/database tests and six HTTP integration tests pass. Safari checks cover the mobile customer journey, a failed-save/retry recovery, merchant submission and responsive previews; see [QA notes and bundle measurements](docs/QA.md). MB WAY verification and the remaining hosted setup are documented in [PAYMENTS.md](docs/PAYMENTS.md).

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
lib/products.ts       42 products + 6 packs; authoritative local catalogue
lib/pricing.ts        Integer-cent arithmetic shared by server and client
lib/analytics.ts      Attribution capture and provider-neutral event transport
lib/validation.ts     Shared Zod boundaries
lib/server/           Supabase/local storage, auth and request handling
lib/dashboard.ts      Documented metric aggregation
supabase/migrations/  RLS, indexes and transactional capture functions
tests/                Domain, PostgreSQL and server integration tests
docs/                 Analytics, manual QA, design and asset provenance
```

The stack is Next.js 16, React 19, strict TypeScript, Tailwind CSS 4, Lucide and Supabase. Dialogs use Radix with Jola's own styling. The server renders the landing content and dashboard; only interactive sections hydrate. Small CSS transitions replace Framer Motion, and the optional merchant form loads on demand. No CMS, customer accounts, live payments, delivery, merchant dashboard or inventory systems are included. Sandbox payment orders and attempts use separate tables in an isolated test project.

## Metric definitions and operating limits

- Money in TypeScript and PostgreSQL is **integer euro cents**. Analytics `basket_value` is euro units; it excludes fees.
- One anonymous identifier is persisted per browser profile. “Visitors” means unique identifiers with a landing view, not unique people. Direct catalogue entrants may start an order without a landing event.
- One simulated order per identifier is created after the first item is added. Clearing the cart preserves the started-order record. A converted order remains converted after later edits.
- GMV sums current nonempty order totals, including fees. Average basket excludes fees and empty baskets.
- Order-to-lead conversion uses converted order sessions / started order sessions. City-only waitlist leads count in the lead total but do not inflate order conversion.
- Product/category charts sum units in current saved baskets, including removals. Packs count as packs; they do not inflate individual-product selections.
- Geography combines orders and leads and deduplicates by session within each city.
- Campaigns use the latest explicitly tagged visit, persisted until replaced by another tagged visit. Untagged navigation preserves attribution. Source, medium, campaign and content are stored.
- Campaign conversion requires a converted order and its saved lead to share campaign/source/medium. A later tagged visit cannot inherit an earlier campaign's conversion. This is current-state demand reporting, not historical multi-touch attribution.
- Funnel dropoff uses started orders → checkout → converted orders. City-only waitlist leads are shown separately from this denominator. Each browser has one durable record, not a record per visit or unique person.
- Landing/product impression events are deduplicated per tab session, including reloads. Product impressions wait for age confirmation. Real add/remove clicks remain individual events.
- Server storage requests have an 8-second deadline; browser submissions have a 12-second deadline. Cart writes coalesce to the latest state, avoiding a backlog during outages. Failed submissions preserve the form and offer retry.
- Analytics delivery is best effort. Contact and order saves report errors and can be retried; analytics loss does not prevent using the product. Vercel Web Analytics measures page views separately from Jola's custom events. The Meta Pixel sends `PageView` only after optional advertising consent; visitors can change that choice on the privacy page.
- Request limits are in-process and suitable for an MVP; use a shared rate limiter or Vercel firewall rules when traffic scales. The dashboard pages through all stored rows and aggregates on the server; use SQL aggregation when volume justifies it.
- Local disk storage is intended for one local server process. Use Supabase for multi-instance deployments.

More detail: [analytics events](docs/ANALYTICS.md), [QA](docs/QA.md), [design and generated asset](docs/DESIGN.md).

## Six-pack validation catalogue

`/pedir` opens on Packs. Four primary packs lead: Só Mais Uma (€14.70, 12 minis), A Clássica (€52.45, 24 minis + Absolut vodka), O Pré (€40.83, Absolut vodka + 4 Red Bull), and Só Somersby (€31.15, 16 ciders). Gin & Chill (€33.22, gin + tonic) and Sem Ressacas (€34.31, 12 alcohol-free beers + 4 Red Bull) sit in a supporting section. The homepage features the four primary packs. Group-size filtering stays optional; individual products remain available.

Pack configuration lives in `lib/products.ts` and reusable components in `lib/pack-components.ts`. Listed prices include default extras. Fixed drink quantities cannot be removed. Brand choices, mixer/snack swaps and extra removals update the price immediately; the server independently validates and calculates it. A pack stays one basket line, with one configuration per pack ID; quantity changes apply to that configuration. Chosen brands, core/extra contents and removals persist in the existing order/lead JSON fields. No new SQL migration is needed. See [pack pricing and configuration](docs/PACKS.md) for all provisional upgrade/removal amounts.

The dashboard focuses on saved-order funnel, campaign and city demand, pack choice, final extra removals and product swaps. Use the Todas, Faro and Lisboa filter to compare city cohorts. Definitions are in [the analytics contract](docs/ANALYTICS.md).

The six pack scenes remain illustrative prelaunch assets. Catalog products use local packshots or sourced product photography; the new Mini, Somersby, 0.0, Red Bull, Eristoff, Luso and cup formats now show photographed products. Combined quantities repeat photographed smaller packs. See [photograph sources](docs/PRODUCT-PHOTOS.md), [art direction](docs/ART-DIRECTION.md) and [asset provenance](docs/DESIGN.md). Replace preview imagery with approved supplier photography before real sales. Existing credential, privacy and deployment requirements remain in [LAUNCH.md](docs/LAUNCH.md).

The first launch cities are not fixed. Catalog and checkout require a city selection to register interest; no city is preselected and no postcode is requested.
