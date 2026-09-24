# Design direction and asset provenance

The brief calls for the feeling of a Portuguese night in: warm, cold drinks at hand, confident and slightly cheeky. The defining visual is the amber Jola delivery bag. Supporting UI stays quiet: product illustrations, simple borders, squared-off buttons and restrained motion on actions.

## Tokens

| Role                | Value     |
| ------------------- | --------- |
| Charcoal background | `#171815` |
| Raised surface      | `#20211D` |
| Warm cream          | `#F4EEDF` |
| Beer amber          | `#EFB735` |
| Secondary text      | `#B2B3A7` |
| Divider             | `#36372F` |

Headings and wordmark use Barlow Condensed 800; body/UI use DM Sans. Both fonts are bundled and served locally. The condensed lettering and product photography carry the identity; dark/amber alone would be too generic for the brand. The layout is left-aligned, with the headline and bag balanced on desktop and a CTA-first stacked composition on mobile. Product and pack colours come from their contents.

## Mobile interaction rules

- Primary touch controls are at least 44 px; core labels and form text use readable 14–16 px sizes.
- Search and category navigation stay together below the shop header. Changing category brings its heading into view.
- Selected products have an amber border and a quantity label; quantity controls reserve space to avoid layout jumps.
- Packs stack large artwork above a receipt on small screens; desktop uses image/content rows. Contents, group size and price are available before adding.
- The compact mobile catalogue introduction gives products more space. Prelaunch status remains visible before ordering and throughout checkout.
- Short CSS transitions support controls; dialogs open immediately. Reduced-motion preferences disable nonessential animation. The merchant form loads only when requested.

## Generated hero

- Mode: built-in `image_gen` tool, not the CLI.
- Production asset: `public/images/jola-hero.webp` (1100 px, approximately 156 KB).
- Original: `public/images/jola-hero.png`.
- Used through `next/image` with explicit dimensions and responsive sizes.
- Seventeen key products now use generated transparent preview packshots; the others retain isolated SVG fallback artwork. These are not manufacturer-supplied photographs.

Exact generation prompt:

> Use case: product-mockup. Asset type: high end Portuguese nightlife delivery brand website hero photograph, square 1024x1024. Create an editorial studio still life of a mustard amber-yellow paper delivery bag with bold black italic wordmark 'JOLA' centered on it. An open bag overflowing with two realistic cold brown glass beer bottles with plain cream labels, green bottle, red cola can, plus blue bag of ice leaning on the right and an orange snack packet at left. Clear ice cubes scattered in foreground on a near black tabletop. Bag centered and entire composition contained within image with generous breathing room. Moody charcoal background #171815 seamless studio, amber side lighting, condensation on bottles, crisp tactile material, subtle film grain, appetizing premium beverage commercial photography. Slightly low camera angle, dynamic yet physically plausible arrangement. Color palette charcoal, warm mustard, cream, little red, glacial blue. No people, no UI, no slogans, no watermark, no text other than JOLA on bag. This is an actual photograph-inspired hero asset, not a web page mockup.

The generated image was inspected and optimized into WebP without editing the depicted content. OpenGraph imagery is generated locally using Next.js `ImageResponse` and the same typography/palette.

## Pack art direction

The final pass retains the hero and introduces large product stages with perforated receipt panels. A Clássica owns the main yellow composition, O Pré uses charcoal, Só Somersby apple green, Gin & Chill mint, Só Mais Uma sand, and Sem Ressacas cold blue. The homepage shows three packs by default; the full six-product menu belongs in `/pedir`.

Ordinary CTA arrows, popularity badges, pack feature checklists and the old equal-card pack grid were removed. The how-it-works section uses a quiet numbered sequence, with the group-chat story retained. Buttons use a 5 px radius, strong labels and pressed feedback. Dialogs open immediately; no essential content depends on an entry fade.

All new raster assets were made with the built-in `image_gen` tool, inspected, and resized/compressed with Sharp without changing their depicted content. Six scenes are stored in `public/images/packs` (about 1 MiB combined); 17 transparent previews in `public/images/products` (about 763 KiB combined). Responsive `next/image` and lazy loading avoid transferring the entire collection on first view.

Prompts and output references: [pack scenes](pack-image-prompts.json), [product packshots](product-image-prompts.json). Exact packaging, brand details and quantities in the illustrative images can differ from supplier products. The text contents and substitutions define the preview pack. Replace files or `lib/product-images.ts` mappings with approved supplier photography before real sales; nothing is hotlinked. Open Food Facts' public API was unavailable during sourcing.
