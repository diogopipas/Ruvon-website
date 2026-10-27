## Robo Courier and authentic callbacks — 25 October 2026

- Final protected Preview `dpl_BRrUonhSpwXE2tJDzUU2w2R3KGzt` is READY after a 20-second build. Health/catalogue return 200/404; production is unchanged and no Uber credential name was added to Production. Upload review found zero private paths/credential matches in 294 regular files.
- Final Test-mode run: one normal outbound delivered with simulated age verification; one customer-unavailable outbound returned, with its separately linked return delivered. One POST per scenario. The deliberately lost second response was recovered from its authentic callback plus an identity-checked GET; observation resumed in another process using the same saved identities.
- Nineteen authentic callbacks (7 normal, 12 return exercise) were verified, persisted and processed into expected unmatched quarantine because this is a carrier-only probe with no commercial order. One controlled re-signed sanitised event replay per scenario returned 200, retained the same inbox ID and exactly one job. Byte-for-byte provider redelivery is not claimed.
- Initial callbacks were 401 because the supplied signing configuration held the webhook URL. After the user corrected it, fresh test identities passed; initial evidence was preserved. The original lost response was recovered through List Deliveries/GET without another POST. Four total outbound test intents across both runs, one POST each.
- The carrier run's Preview `dpl_9AmmoWivUoKeojyScVQdLzk9WRuV` exposed Checkly 429 responses during callback bursts. The final Preview confines monitor pings/health acknowledgement to scheduled work. Eight subsequent controlled replays returned 200 and kept the same event/job identities; immediate workers still process durable work without masking scheduler failure. Two scheduled worker calls thirty seconds apart returned 200 and advanced the database success heartbeat; the initial final-release runtime error scan returned zero records.
- 285 local tests across twenty files, TypeScript and lint pass. Coverage includes pre-dispatch Uber identity guards, sanitised status retention, provider-only return quarantine, known-return recovery, documented signature-header fallback and scheduled/immediate heartbeat separation. All seven legacy orders/ten attempts retain complete-row hashes; flow 2 orders/stores/capability evidence remain zero. No new migration, live delivery or customer payment occurred.
- Paid order orchestration, settlement, production alcohol eligibility, provider idempotency retention/replay guarantees and the application's active-delivery cancellation policy remain unverified. Carrier transport acceptance does not enable checkout.

## Uber Direct authentication and quote — 25 October 2026

- 273 unit/database/transport tests across nineteen files, TypeScript and lint pass. New tests cover the user's `UBER_DIRECT_*` names, legacy fallback, explicit blank values, disabled delivery mode, token reuse and cache isolation on secret/environment changes. Browser fixture servers blank the new variables to prevent use of local provider credentials.
- A separate private probe exercised the actual adapter with the user-provided test credentials. Exactly one OAuth call and one quote call returned 200; the quote passed EUR/expiry validation and returned 609 cents for a public Lisbon route. The probe permitted no delivery endpoint and saved no token/credential values. No delivery, notification, database mutation, deployment or credential upload occurred.
- This first probe verified test authentication and quoting only. The later carrier run above establishes booking, Robo Courier, tracking, returns, authentic callbacks and controlled lost-response recovery. Active-delivery cancellation and production alcohol approval remain outstanding. Checkout stays disabled; the later Preview uses sandbox delivery mode.

## Easypay payment integrity — 24 October 2026

- 269 unit/database/transport tests across nineteen files, TypeScript and lint pass. New cases cover account/environment/request rejection before dispatch, distinct authorisation/Single identifiers, hosted checkout identity, late callbacks after capture/void/expiry, pending captures, exact split allocation, lost responses, reserved refunds and missing Marketplace configuration.
- Migration 016 is tested for atomic provider-fact/review/audit/alert rollback, duplicate case/notification keys, expired leases and preserved successful history. It is applied only to the isolated sandbox. Earlier migrations are unchanged; hosted parity/release evidence follows in the implementation status.
- Real sandbox GETs for the Single list, a legacy MB WAY Single and its existing successful capture returned 200; parent identity/value match. No provider mutation was performed. These reads do not verify authorisation/capture/void/refund/splits for flow 2 or enable live checkout.
- The protected Preview is READY after a 52-second build. Health/catalogue/merchant reads return 200/404/401 respectively; three scheduled worker calls returned 200. Sandbox schema/grant parity matches 25 tables and 59 functions, and all seven legacy orders/ten attempts retain their full-row hashes. The public deployment is unchanged. These checks do not constitute end-to-end financial acceptance.

## Public copy without launch labels — 24 October 2026

- Removed hero launch badge, ~25-minute sticker, early-access/upcoming wording and phase labels from public marketing, the A.M.O. presentation, FAQ, contact flow, legal copy and social-sharing metadata/image. Existing A.M.O. pack layout/assets from concurrent workspace work were preserved. The final form and confirmation clearly identify a registration of interest.
- Build, TypeScript, lint and seven HTTP regressions passed. Twenty-four local responsive checks cover 320/390/768/1440 px, including synthetic local registrations. Twelve anonymous production-browser checks cover 390/1440 px, without submitting real forms. No page errors or horizontal overflow occurred. Public privacy identity/contact match the owner's explicit information.
- Production `dpl_GZYgrDCpY2Fs1RR6p7A1sdtBZYpb` is READY. The public sharing image returned 200 and was visually checked; commerce catalogue remains 404. No financial/provider mutation or migration occurred. Public operator/privacy Config values were persisted in Production; provider secrets were not transferred. These presentation checks are not fulfilment acceptance.

## A.M.O. discovery pack — 24 October 2026

- The category now presents one pack with one 33 cl bottle of each confirmed beer for €12.50 including VAT, official brewery lettering and bottle images, a lilac/pink split layout and a brewery description. Ordering remains unavailable.
- Safari desktop and Firefox at 320 px were visually reviewed. Searching for Borboletas retains all three beers and the full pack price; an unmatched search shows the pack empty state. The existing 13 pack tests, TypeScript, scoped ESLint and Webpack production build pass. Default Turbopack compilation is blocked by the environment's local-port restriction, including the escalated attempt; no configuration was changed to work around it.

## Separate A.M.O. category — 24 October 2026

- Homepage/default/other categories no longer show the A.M.O. products. The A.M.O. filter at `/pedir?categoria=amo` shows the three confirmed beers, prices and upcoming status. No images or purchase controls were added.
- Build, TypeScript, lint, formatting and seven HTTP regressions pass. Four local responsive browser journeys and two anonymous production journeys verify category selection, filtering/empty recovery, reload, switching away, unchanged prices and compatibility with `/pedir#amo` without losing campaign parameters. No horizontal overflow or page errors occurred.
- Production `dpl_6GgnVfMMYPXnLZUqg5FyBuMQ1kY2` is READY. Homepage returns 200, commerce catalogue 404, and the initial five-minute runtime scan returned zero errors. The operational draft is projected to public fields by a server-only adapter. Images are explicitly deferred; operational launch acceptance is unchanged.

## Visible A.M.O. catalogue — 23 October 2026

- The three confirmed 33 cl bottle names and VAT-inclusive prices appear on the homepage and above the validation packs at `/pedir#amo`, explicitly marked upcoming and unavailable for orders. No purchase controls, stock, alcohol percentages or unapproved images were added.
- Build, TypeScript, ESLint and seven HTTP regression tests pass. Eight local browser checks cover the two pages at 320/390/768/1440 px, with zero page errors and no horizontal overflow. A 5 px overflow in the existing category gutters at 320 px was corrected for both pages.
- The protected Preview passed health/auth/disabled-commerce checks. Production `dpl_F62MoKFxp7dzMk2nXWjFXi1Wu5Ye` is READY. Four anonymous production-browser checks cover both pages at 390/1440 px, including the catalogue after hydration, with all products visible, no purchase controls and zero page errors. Public pages/interest checkout return 200, commerce catalogue 404, and the initial five-minute runtime error scan returned zero records. Sandbox Cron still returns 200 after its alias update.
- The merchant draft remains unimported and operational launch gates are unchanged. No production database migration, credential transfer, paid subscription, real order or provider mutation was performed. This presentation is not end-to-end fulfilment acceptance. See [implementation status](IMPLEMENTATION-STATUS.md) for release identities and remaining work.

## Durable SMS verification — 20 October 2026

- **229 tests across seventeen files**, TypeScript, ESLint and the webpack production build pass. The final service-response refinement passes the focused twelve SMS tests and typecheck. Seven production HTTP tests pass, including unsigned SMS callback rejection without reflecting untrusted content.
- Synthetic tests cover disabled/Trial gates, exact signatures and Unicode, authentication before database access, identity conflicts, duplicate/reversed callbacks, lost responses, one dispatch, worker budget/lease expiry and reconstruction of the same six read jobs. No real SMS was sent by these tests.
- Migration 015 is applied only to the sandbox: all 25 tables / 59 functions match the schema/ACL reference. All seven legacy orders and ten attempts retain their prior hashes. Commerce orders, stores and capabilities remain zero, with an advancing worker heartbeat.
- A prior Console trial SMS was marked delivered and the user confirmed receipt. It is separate from the one-shot rejected API probe and is not correlated order acceptance. Custom SMS remains disabled; no Twilio secret was uploaded or paid upgrade performed. The new protected Preview passed health/auth/kill-switch and unsigned SMS callback checks; a scheduled worker call returned 200 with zero errors in the five-minute scan. Production is unchanged. Deployment details are recorded in [implementation status](IMPLEMENTATION-STATUS.md).

## Store catalogue verification — 20 October 2026

- Seven domain tests cover new physical store SKU pricing/compliance, availability, stock shared with multipacks/configured packs, malformed/forged inputs, validation/payment isolation and commerce receipt deduplication. Synthetic brewery data are confined to tests, not merchant seed data.
- 209 unit/database/transport tests across sixteen files, TypeScript and ESLint pass. Two focused mobile Chrome journeys pass: craft units/cart/quote recovery through reload and the existing payment-order/cart regression. The initial browser launch was blocked by the filesystem sandbox port policy; the allowed rerun used installed Chrome because the Playwright Chromium binary is absent.
- The commerce browser configuration blanks Twilio credentials as well as payment/delivery/email/database credentials. No real SMS, charge, dispatch or merchant record was created by these tests.
- Migration 014 is applied to the isolated hosted sandbox: 25 public tables / 56 functions match the schema/ACL reference and all seven legacy orders / ten attempts retain their prior hashes. The deadline/recovery Preview passed health/auth/kill-switch checks and a real scheduled worker request returned 200. The final craft-catalogue Preview also returned health 200, private APIs 401 and disabled catalogue 404; a post-alias scheduled worker request returned 200 with zero runtime errors in the ten-minute scan. Production remained unchanged. This is deployment/recovery evidence, not complete financial provider acceptance.

# Manual QA and verification

The historical checks below concern demand validation and the legacy payment sandbox. New commerce verification is tracked separately in [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md). Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`, and `npm run test:commerce-browser`. The commerce browser suite uses explicitly synthetic browser responses with provider credentials blanked; it tests UI recovery and preparation guards, **not real provider acceptance**. Actual checkout → capture → delivery → merchant settlement with zero admin commands remains unrun and blocked by the prerequisites in [PRODUCTION-PILOT.md](PRODUCTION-PILOT.md).

Earlier commerce verification: 175 automated tests across fourteen files, seven production HTTP integration tests and twenty-two mobile browser journeys passed. The browser suite uses a separate `.next-playwright` cache and `tsconfig.browser-tests.json` while keeping the developer server open. After running it, `npx next typegen` or the production build restores default generated route references. The suite ran with installed Chrome using `PLAYWRIGHT_CHANNEL=chrome npm run test:commerce-browser`. Merchant checks include same-command replay after lost responses, return receipt recovery, read-only recovery after confirmation, stale-version rejection, uncertain HTTP outcomes, old-read fencing and access loss on order/inventory/heartbeat requests. Database assertions reject a replay with altered content or another staff identity. The webpack production build, lint and TypeScript passed; default Turbopack previously hit a local sandbox port-binding restriction. Changed files pass formatting; repository-wide formatting reports 24 pre-existing files. These results do not supersede the required real-provider and outage/restart acceptance tests.

Hosted sandbox verification on 2026-10-13 also passed schema/grant parity for 006–011, preservation of existing payment history, repeated 30-second worker HTTP 200 runs, authentic Resend sent/delivered callbacks and duplicate replay, unsigned callback rejection, disabled-commerce isolation and healthy Checkly worker pings. Production remains unchanged. These synthetic email callbacks have no order notification ID and are safely quarantined; no financial or complete order notification acceptance is claimed. Details and remaining gates are in [implementation status](IMPLEMENTATION-STATUS.md).

The 2026-10-15 operations update additionally passes full thirteen-migration schema/ACL parity, service privilege narrowing, safe store-command/callback replay and session-loss UI tests. The protected Preview is READY. The operator created a confirmed sandbox Auth account, received the authorised `operations_admin` role and personally signed in. Safari verified real authenticated health-panel data and the orders page; no password/token was retained and no hosted control/financial command was submitted. Real merchant/store control acceptance remains outstanding.

Use a private browser profile and a synthetic contact such as `qa@example.com`. Do not use real customer data in local testing.

## Exact acceptance journey

1. Open `/?utm_source=instagram&utm_campaign=qa_mobile&utm_content=night_2347` at 390 × 844.
2. Confirm the age gate is visible and focus is trapped in the dialog. Choose “Não”: the catalogue stays blocked. Return and confirm 18+.
3. Verify hero, primary CTA and preview messaging. Refresh; age confirmation should persist.
4. Click “Pedir uma Ruvon”. Add one each: Super Bock Original 6 × 33 cl, Saco de gelo 2 kg, Coca-Cola Original 1,75 L, Doritos Tex-Mex 225 g.
5. Verify the floating cart shows four articles. Open it.
6. Confirm subtotal **14,46 €**, delivery **2,99 €**, Ruvon fee **0,89 €**, total **18,34 €**. Increment/decrement and check the total changes.
7. Choose “Continuar para a minha zona”, select **Lisboa**, and continue to the launch-notification form. No postcode field should appear.
8. Confirm the zone-by-zone launch message and the “Quero saber quando chegar” CTA. Refresh; the location, basket and contact step must survive.
9. Enter a synthetic email or valid-format Portuguese phone, check consent, submit.
10. Confirm “Vais saber quando chegar.” and the selected zone. Refresh: success persists. “Voltar ao início” returns to the homepage.
11. Open `/admin`, authenticate with the configured password, verify the lead, basket, city, conversion, products and `qa_mobile` campaign.
12. Confirm records in Supabase, or `.data/jola.json` when explicitly running locally. Retrying the same lead must not create duplicates.

## Other flows

- [ ] Landing category links open the correct filtered catalogue; filters survive refresh.
- [ ] Search matches product names and displays a helpful empty state. Clear search restores results.
- [ ] All six validation packs add correctly; the four homepage features expose the same detail/cart flow.
- [ ] Remove the last item: zero fees, useful empty-cart state, no checkout submission.
- [ ] Direct empty `/checkout` offers a route back to the catalogue.
- [ ] Each city button preselects its city; “Outra” permits an arbitrary city. A city-only signup does not create a fake order.
- [ ] Merchant navbar and section CTA open the same form. Validated submissions appear separately in the admin dashboard.
- [ ] Invalid contacts, missing cities, missing consent and honeypot values are rejected.
- [ ] A failed submission stays on the form, preserves the basket and permits retry; never show success on a non-200 response.
- [ ] Keyboard focus is visible. Dialog Escape/close/backdrop behavior works; the age gate cannot be dismissed accidentally.
- [ ] Reduced-motion preference disables nonessential animations.
- [ ] Review at 390 × 844, 430 × 932, 768 × 1024 and 1440 × 900, at standard page zoom. No page-level horizontal scrolling. Category rows and dashboard tables may scroll within themselves.
- [ ] Desktop catalogue cart remains visible while scrolling. Mobile bottom cart does not cover the last product.
- [ ] OG image, sitemap, not-found page and privacy/terms render correctly.
- [ ] Anonymous `/admin` shows no leads. Invalid login fails; logout removes access. Change the password to invalidate prior sessions.

## Checks performed in this workspace

- Production build, strict TypeScript and ESLint pass.
- **69 automated tests** cover canonical prices, validation, URL configuration, funnel/campaign metrics, request deadlines, coalesced writes, draft storage, attribution, event deduplication, pack options and pack demand. PostgreSQL tests include rollback, anonymous access denial, merchant retries and preserving a lead basket after a city-only signup.
- **Five production HTTP integration tests** cover the full funnel, canonical prices, UTM preservation, retries, auth, error boundaries, separate merchant/city flows, public routes/OG and pack substitutions through order, lead and analytics. These exercise real HTTP endpoints; they do not automate a browser.
- Safari responsive previews were inspected at all four requested sizes. The 390 px customer journey included age acceptance, all four acceptance products, sticky catalogue filters, quantity controls, mobile cart and the **18,34 €** total.
- Checkout preserved the contact step and email draft through reload, and retained the email when switching to phone and back. Seven postcode digits formatted as `1000-001`.
- An intentional local storage outage returned HTTP 503. The form showed a retryable error, preserved the contact/consent/basket and did not display success. Restoring storage and retrying produced “Estás dentro.” without a duplicate lead.
- A synthetic merchant submission at 430 px completed successfully and was stored separately. Local records confirmed the customer basket, Lisboa postcode, conversion and `polish_mobile` campaign, plus the separate merchant record.
- Browser testing uses synthetic local records in `.data/polish`; automated integration data is isolated in `.data/integration`. No production records were changed.
- A hosted Supabase instance and public Vercel deployment were not verified. Apply the launch requirements in `LAUNCH.md`, then repeat this acceptance journey against the deployment.

## Performance measurement

These measurements describe the previous reliability/polish pass, before the final pack imagery and pack-detail UI were added. They are retained as a historical baseline, not a claim about the final pack build.

Compared production HTML script references before and after the polish pass, summing the gzip size of each unique initially referenced JavaScript chunk per route:

| Route     |  Before |   After | Reduction |
| --------- | ------: | ------: | --------: |
| Homepage  | 337 KiB | 294 KiB |       13% |
| Catalogue | 332 KiB | 292 KiB |       12% |
| Checkout  | 333 KiB | 291 KiB |       13% |

Removing Framer Motion and loading the merchant form on demand accounts for the main reduction. These are local build transfer-size estimates, not Lighthouse or Core Web Vitals results. Measure the hosted deployment on a realistic mobile network before increasing paid traffic.

## Initial visual pack pass — 24 September 2026

Historical results below use the previous prices and three-feature layout; the core/extras revision supersedes them.

- `/pedir` defaults to Packs and exposes exactly six validation packs. The homepage features three by default, with at most three after optional group filtering.
- Six additional unit tests check agreed names/prices, nonempty group choices, canonical substitutions, invalid-option rejection, checkout identity, event metadata and dashboard definitions. The fifth HTTP integration test verifies options/contents through order, lead, analytics and duplicate-submit recovery.
- Safari at 390 × 844: selected 2–3 (Só Mais Uma) and 7+ (A Clássica with an explicit 5–7-person limit), opened complete contents, chose Sagres and Zero, added the whole pack, added ordinary ice through quick extras, opened the cart and continued into checkout.
- The cart and checkout retained Sagres/Zero. Lisboa + `1000001` normalized correctly. Synthetic email signup succeeded. Local storage confirmed exactly one lead, two basket lines, canonical total **56,77 €**, both substitutions, full contents and `packs_final` attribution. Pack impression/add/cart/checkout/waitlist event payloads were present.
- Essential modal and product content no longer depends on an entry fade. Active categories stay visible after changing viewport size; mobile packs have a compact introduction.
- Final Safari checks covered 390 × 844 and 430 × 932 catalogue/detail layouts, the 430 px homepage and the 1440 × 900 flagship composition. Beer packshots loaded, empty search recovered, and searching from Packs switched to matching individual products.
- The local dashboard displayed A Clássica as one selected pack reaching checkout, a €52.89 pack-basket subtotal versus €14.46 without packs, 50% of the two local checkouts containing a pack, and one ice add-on. These are synthetic QA records, not customer demand.
- Safari's inspector showed an error-count badge but no message in the console, including after clearing and reloading. The source could not be identified through the native controls. Console validation remains unconfirmed; no claim of a clean console or Lighthouse result is made.
- Final generated assets were visually inspected. Packaging is illustrative, not a claim of manufacturer approval or exact supplier appearance.

Repeat the pack journey against hosted Supabase/Vercel before paid traffic. This historical validation pass did not include browser automation; the new commerce suite described above does.

## Core and extras revision

- Four primary packs now lead the homepage/catalogue; Gin & Chill and Sem Ressacas form the secondary selection. All six default prices and fixed core quantities match the revised brief.
- 69 automated tests pass, including fixed-core preservation after removing all extras, rejection of core removal, combined price changes, checkout identity and structured customization analytics. Five production HTTP integration tests pass; the pack test saves brand swaps and removals through order, lead, retry and analytics with canonical pricing.
- Safari at 390 × 844: selected Sagres, Smirnoff, 7Up and Pringles on A Clássica; removed ice, cups and water. The pack became **€55.65**, with **€59.53** including fees. Restoring cups in the cart added €1.25; removing them reverted it. Two packs showed €111.30 subtotal / €115.18 total. Returning to one pack and completing the synthetic signup preserved the exact contents and price.
- `.data/packs-customization` confirmed one synthetic lead, both fixed drinks, only three selected extra components, the three removal keys, seven detail changes and two cart changes. Saving the detail did not duplicate its change events. Attribution remained `pack_customization_qa`.
- At 430 × 932, the primary/supporting hierarchy and Gin & Chill controls were checked; gin and tonic remained fixed while its extras were editable.
- Removed remaining entry fades from the mobile cart and checkout content so essential content renders immediately in background Safari previews.
- This revision uses provisional pack contribution amounts documented in `PACKS.md`. Existing generated scenes remain illustrative; no deployment or remote database changes were made.

## Product-first storefront review — 24 October 2026

- Homepage now presents categories and eight essential products instead of a promotional section sequence. Category filters share the current URL, cart and search.
- Reviewed the local homepage in Firefox at 320 px and 390 px mobile widths and the desktop window. Confirmed product photography appears in the opening viewport, category selection changes content in place, and keyboard navigation reaches search.
- Manually checked search and clearing search, adding/removing one product, cart contents/totals, six compact packs, A.M.O. price and disabled ordering, and merchant deep-link opening/closing via `?loja=1`. Restored the browser cart to empty.
- TypeScript and ESLint passed. Production build passed with `npm run build -- --webpack`. Default Turbopack compilation hit an environment restriction binding an internal port; no build configuration was changed.
