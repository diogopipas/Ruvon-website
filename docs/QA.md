# Manual QA and verification

Use a private browser profile and a synthetic contact such as `qa@example.com`. Do not use real customer data in local testing.

## Exact acceptance journey

1. Open `/?utm_source=instagram&utm_campaign=qa_mobile&utm_content=night_2347` at 390 × 844.
2. Confirm the age gate is visible and focus is trapped in the dialog. Choose “Não”: the catalogue stays blocked. Return and confirm 18+.
3. Verify hero, primary CTA and preview messaging. Refresh; age confirmation should persist.
4. Click “Pedir uma Jola”. Add one each: Super Bock Original 6 × 33 cl, Saco de gelo 2 kg, Coca-Cola Original 1,75 L, Doritos Tex-Mex 225 g.
5. Verify the floating cart shows four articles. Open it.
6. Confirm subtotal **14,46 €**, delivery **2,99 €**, Jola fee **0,89 €**, total **18,34 €**. Increment/decrement and check the total changes.
7. Choose “Continuar para a minha zona”, enter **Lisboa / 1000-001**, and continue to early access.
8. Confirm the zone-by-zone launch message and planned 5 € incentive. Refresh; the location, basket and contact step must survive.
9. Enter a synthetic email or valid-format Portuguese phone, check consent, submit.
10. Confirm “Estás dentro.” and the 5 € ticket. Refresh: success persists. Sharing opens native share where available or copies the URL; do not send a test message to anyone.
11. Open `/admin`, authenticate with the configured password, verify the lead, basket, postcode, conversion, products and `qa_mobile` campaign.
12. Confirm records in Supabase, or `.data/jola.json` when explicitly running locally. Retrying the same lead must not create duplicates.

## Other flows

- [ ] Landing category links open the correct filtered catalogue; filters survive refresh.
- [ ] Search matches product names and displays a helpful empty state. Clear search restores results.
- [ ] All six validation packs add correctly; the four homepage features expose the same detail/cart flow.
- [ ] Remove the last item: zero fees, useful empty-cart state, no checkout submission.
- [ ] Direct empty `/checkout` offers a route back to the catalogue.
- [ ] Each city button preselects its city; “Outra” permits an arbitrary city. A city-only signup does not create a fake order.
- [ ] Merchant navbar and section CTA open the same form. Validated submissions appear separately in the admin dashboard.
- [ ] Invalid contacts, postcodes, missing consent and honeypot values are rejected.
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

Repeat the pack journey against hosted Supabase/Vercel before paid traffic. Browser automation is not part of the test suite.

## Core and extras revision

- Four primary packs now lead the homepage/catalogue; Gin & Chill and Sem Ressacas form the secondary selection. All six default prices and fixed core quantities match the revised brief.
- 69 automated tests pass, including fixed-core preservation after removing all extras, rejection of core removal, combined price changes, checkout identity and structured customization analytics. Five production HTTP integration tests pass; the pack test saves brand swaps and removals through order, lead, retry and analytics with canonical pricing.
- Safari at 390 × 844: selected Sagres, Smirnoff, 7Up and Pringles on A Clássica; removed ice, cups and water. The pack became **€55.65**, with **€59.53** including fees. Restoring cups in the cart added €1.25; removing them reverted it. Two packs showed €111.30 subtotal / €115.18 total. Returning to one pack and completing the synthetic signup preserved the exact contents and price.
- `.data/packs-customization` confirmed one synthetic lead, both fixed drinks, only three selected extra components, the three removal keys, seven detail changes and two cart changes. Saving the detail did not duplicate its change events. Attribution remained `pack_customization_qa`.
- At 430 × 932, the primary/supporting hierarchy and Gin & Chill controls were checked; gin and tonic remained fixed while its extras were editable.
- Removed remaining entry fades from the mobile cart and checkout content so essential content renders immediately in background Safari previews.
- This revision uses provisional pack contribution amounts documented in `PACKS.md`. Existing generated scenes remain illustrative; no deployment or remote database changes were made.
