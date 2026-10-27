# Final pack direction

## Core and extras revision

Keep the existing palette, type and receipt motif. Lead with four primary packs; give Gin & Chill and Sem Ressacas a compact supporting section. A Clássica retains the biggest composition. Put fixed drink quantities in prominent type, with default extras in a quieter line. Prices include the default extras; show every upgrade/deduction next to its control.

```text
Four primary products → two supporting alternatives
Detail: fixed drinks + brand buttons
        useful extras + swap/remove controls
        live price + one add/update action
Cart: selected contents + compact edit disclosure
```

Rejected: putting every option on the product cards, or splitting customization into a wizard. Keep cards scannable and customization in one panel. This revision supersedes the earlier three-feature layout and two-option limit below.

Preserve the photographic hero, charcoal `#171815`, amber `#efb735`, cream `#f4eedf`, local Barlow Condensed display type and DM Sans utility text. Supporting pack stages use apple `#cbd19a`, mint `#bdd1c4` and cold blue `#b8d7dd`.

Initial idea: six equal product cards. Rejected: too close to a pricing grid, too much choice on the homepage.

Chosen composition: a large A Clássica product stage beside a compact receipt; two smaller occasion-led products follow. The full catalogue uses six generous product rows, with optional group-size filtering and short summaries. Everything remains left aligned, with the price and action in a consistent utility area.

```text
Homepage                       Catalogue
Large existing hero            Packs / individual categories
Quantos são?                   Quantos são? (optional)
[ flagship image | receipt ]   [ Clássica image | short contents + choose ]
[ O Pré ] [ Só Somersby ]       [ next pack image | short contents + choose ]
Ver todos os packs             ... six public packs
Compact individual products
```

Two recurring devices: large cold-product crops and the perforated receipt edge. No popularity badge, feature checklist, decorative CTA arrows or repeated icon-heading-paragraph cards. The menu stays simple: at most beer and mixer substitutions. Cart lines remain whole packs, with their chosen options.

Generated pack scenes are illustrative prelaunch assets, not supplier-approved product photographs. Keep these isolated under `public/images/packs` and record their prompts/provenance before handoff.

## A.M.O. pilot presentation — 23 October 2026

Use the existing charcoal, cream, amber, Barlow Condensed and DM Sans. A single cream section groups the three confirmed bottle names, 33 cl units and VAT-inclusive prices. Product columns share dividers on desktop and become a vertical list on mobile. Show the upcoming status and unavailable ordering once for the group. No invented packshots, labels, tasting notes, alcohol percentages or stock badges. The homepage links to `/pedir#amo`, where the section precedes the validation packs. No quantity or purchase action appears in the pilot presentation.

## Separate A.M.O. category — 24 October 2026

This supersedes the homepage placement above. Remove the A.M.O. landing section and show these beers only when the native A.M.O. catalogue filter is selected. Keep the confirmed names, 33 cl format, prices and upcoming status. The category shares the catalogue navigation and search. Product imagery is a future request; do not create images or empty image placeholders now.

## A.M.O. discovery pack — 24 October 2026

The user's subsequent request supersedes the separate-product presentation and deferred imagery above. Present one pack containing all three 33 cl beers, using the existing split product-stage/receipt layout and perforated edge. Reserve lilac `#c5b4df` and rose `#f2b6aa` for A.M.O., with ink `#2b2430` and paper `#fff6ed`. Use the official brewery wordmark to preserve the lettering in the supplied reference, official transparent bottle photographs, and a brief brewery story based on its official About page. Display the summed VAT-inclusive price (€12.50) and upcoming availability. Search always returns the complete pack. Sources are recorded in [PILOT-AMO.md](PILOT-AMO.md).

## Neutral public presentation — 24 October 2026

Remove launch/early-access badges and the hero ~25-minute sticker. Use product and brand copy without phase labels in public pages or social sharing imagery. Keep the actual final action named registration of interest until ordering is enabled; do not imply a payment or delivery was confirmed. Preserve the current A.M.O. imagery and pack layout from the workspace.

## Product-first homepage — 24 October 2026

This direction supersedes the long promotional homepage. Open directly into a working storefront: a compact photographic introduction, native category filtering, and eight essential products with names, units, prices and add controls. Preserve the Ruvon charcoal, cream, amber, local Barlow Condensed and DM Sans. Category photography uses a compact horizontal treatment on the homepage; retain the independently updated category gallery in the full catalogue. Keep product photography on quiet, uniform backgrounds.

Remove the benefit strip, repeated calls to order, imagined group chat, steps, city promotion and long FAQ from the homepage. Help becomes a disclosure and merchant registration remains available through a small footer action, including existing `?loja=1` links. Use compact pack cards with the existing configuration modal. Preserve A.M.O. photography, the €12.50 summed price and unavailable purchase status; put the brewery story behind a disclosure. Keep real ordering and interest-registration behavior determined by existing environment gates.
