# Before paid traffic

These are concrete outstanding deployment/business requirements from the second-pass audit, not completed account changes.

1. **Revoke the exposed Supabase service-role credential.** An earlier Git commit included it in `.env.example`. The current template is clean; history still contains the old value. Replace the credential in Vercel and your ignored local environment. Never paste it into issues or chat.
2. Apply `supabase/migrations/002_preserve_lead_basket.sql` after 001. It is safe to rerun.
3. Configure `JOLA_OPERATOR_NAME` with the actual legal person/company responsible and `NEXT_PUBLIC_CONTACT_EMAIL` with a monitored inbox you control. A personal project can name its actual operator; the code cannot invent that identity. Rebuild after changing these values.
4. Review the proposed 12-month retention period. Arrange a monthly review and deletion/anonymisation of expired records in all four tables, including backups under your provider's policy. Browser state and server records are separate. This MVP has no scheduled purge.
5. Confirm Supabase/Vercel region and processing arrangements, the privacy basis for demand measurement, and the final €5 launch-offer conditions. The current incentive is described as planned, not an issued voucher.
6. Deploy and repeat the synthetic acceptance journey in `QA.md`, checking the saved rows and protected dashboard. Code tests use local data and cannot prove a remote project has the correct secrets or migrations.

The privacy draft follows the need to explain identity, purposes, retention and rights in the [European Commission's data protection guidance](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en). The 12-month period is a proposed product policy, not a statutory default or a legal certification.

## First validation experiment

Run two small, separately tagged Instagram creative tests in the same launch zone: “Falta gelo?” versus the general “Acabou a bebida?”. Keep audience, spend and catalogue constant. Compare started baskets, checkout-to-contact conversion, basket value and postcode concentration. Use unique `utm_campaign`/`utm_content` values. Decide the next launch zone from qualified contacts and basket demand, not click-through rate alone.
