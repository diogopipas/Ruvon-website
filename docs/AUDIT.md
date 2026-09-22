# Second-pass audit

Repository-wide review completed before implementation. The existing brand, catalogue, integer-cent pricing and transactional storage are retained.

## Critical

- A service-role credential was committed in `.env.example`. Remove it from the template; the project owner must revoke it and update deployment secrets. Removing the current value does not revoke the historical credential.
- Core mobile controls are too small (28 px quantity buttons; 7–11 px labels).
- Checkout implies live availability even though every area is prelaunch.

## High impact

- Requests have no deadlines; a stalled order write blocks subsequent checkout work.
- Retry/double-click paths can duplicate checkout events and merchant registrations.
- A permanent completion flag shows success for unrelated future baskets and cities.
- Product impressions fire behind the age gate and repeat after filters remount cards.
- Packs are hard to compare on mobile, and only one appears in the catalogue.
- Search and categories scroll away; selected products need a stronger visual state.
- Admin product demand counts add/remove churn; campaigns lack checkout and conversion context.
- A city-only repeat signup can overwrite previous basket evidence.
- Privacy needs a real operator/contact and an explicit retention policy before paid traffic.

## Polish

- Preserve contact drafts, move focus between steps, accept unformatted postcodes.
- Improve loading, retry, empty states, toast wrapping and safe-area spacing.
- Keep primary CTA wording consistent and improve footer/link targets.
- Inspect bundle cost and lazy-load optional UI where worthwhile.

## Verification

Final results and remaining operational requirements are recorded in [QA.md](QA.md). The browser preview and API tests use isolated local data, never live customer records.
