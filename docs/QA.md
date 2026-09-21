# Manual QA and verification

Use a private browser profile and a synthetic contact such as `qa@example.com`. Do not use real customer data in local testing.

## Exact acceptance journey

1. Open `/?utm_source=instagram&utm_campaign=qa_mobile&utm_content=night_2347` at 390 × 844.
2. Confirm the age gate is visible and focus is trapped in the dialog. Choose “Não”: the catalogue stays blocked. Return and confirm 18+.
3. Verify hero, primary CTA and preview messaging. Refresh; age confirmation should persist.
4. Click “Pedir uma Jola”. Add one each: Super Bock Original 6 × 33 cl, Saco de gelo 2 kg, Coca-Cola Original 1,5 L, Doritos Tex-Mex 140 g.
5. Verify the floating cart shows four articles. Open it.
6. Confirm subtotal **14,46 €**, delivery **2,99 €**, Jola fee **0,89 €**, total **18,34 €**. Increment/decrement and check the total changes.
7. Continue, enter **Lisboa / 1000-001**, and check availability.
8. Confirm the launch message and 5 € offer. Refresh; the location, basket and contact step must survive.
9. Enter a synthetic email or valid-format Portuguese phone, check consent, submit.
10. Confirm “Estás dentro.” and the 5 € ticket. Refresh: success persists. Sharing opens native share where available or copies the URL; do not send a test message to anyone.
11. Open `/admin`, authenticate with the configured password, verify the lead, basket, postcode, conversion, products and `qa_mobile` campaign.
12. Confirm records in Supabase, or `.data/jola.json` when explicitly running locally. Retrying the same lead must not create duplicates.

## Other flows

- [ ] Landing category links open the correct filtered catalogue; filters survive refresh.
- [ ] Search matches product names and displays a helpful empty state. Clear search restores results.
- [ ] All four party packs add correctly and expose the cart on the homepage.
- [ ] Remove the last item: zero fees, useful empty-cart state, no checkout submission.
- [ ] Direct empty `/checkout` offers a route back to the catalogue.
- [ ] Each city button preselects its city; “Outra” permits an arbitrary city. A city-only signup does not create a fake order.
- [ ] Merchant navbar and section CTA open the same form. Validated submissions appear separately in the admin dashboard.
- [ ] Invalid contacts, postcodes, missing consent and honeypot values are rejected.
- [ ] A failed submission stays on the form, preserves the basket and permits retry; never show success on a non-200 response.
- [ ] Keyboard focus is visible. Dialog Escape/close/backdrop behavior works; the age gate cannot be dismissed accidentally.
- [ ] Reduced-motion preference disables nonessential animations.
- [ ] Review at 320, 390, 768, 1280 and 1440 px. No page-level horizontal scrolling. Category rows and dashboard tables may scroll within themselves.
- [ ] Desktop catalogue cart remains visible while scrolling. Mobile bottom cart does not cover the last product.
- [ ] OG image, sitemap, not-found page and privacy/terms render correctly.
- [ ] Anonymous `/admin` shows no leads. Invalid login fails; logout removes access. Change the password to invalidate prior sessions.

## Checks performed in this workspace

- Production build, strict TypeScript and ESLint pass.
- 21 automated tests cover prices, validation, metric definitions and the PostgreSQL migration, including transaction rollback and anonymous access denial.
- Four production HTTP integration tests cover the complete storage funnel, canonical prices, UTM preservation, retries, auth, error boundaries, separate merchant/city flows and public routes/OG.
- Safari: desktop homepage and 390 × 844 customer flow reviewed. Age gate accepted, all four acceptance products added, mobile drawer totals verified, Lisboa/postcode saved, contact step refreshed successfully, synthetic contact submitted and success confirmed. The desktop dashboard then showed the same lead, 18,34 € order, 1000-001 postcode and qa_mobile/night_2347 attribution.
- Dependency audit reports no known vulnerabilities after updates.
- Browser testing uses synthetic local records. Automated integration data is isolated in `.data/integration`.
- A hosted Supabase instance and a public Vercel deployment were not available for verification. Run the same acceptance journey after configuring them.
- No Lighthouse score is claimed; public deployment performance remains to be measured under realistic network conditions.
