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

## Generated hero

- Mode: built-in `image_gen` tool, not the CLI.
- Production asset: `public/images/jola-hero.webp` (1100 px, approximately 156 KB).
- Original: `public/images/jola-hero.png`.
- Used through `next/image` with explicit dimensions and responsive sizes.
- The catalogue illustrations are original code-native SVG demo artwork, not brand product photographs.

Exact generation prompt:

> Use case: product-mockup. Asset type: high end Portuguese nightlife delivery brand website hero photograph, square 1024x1024. Create an editorial studio still life of a mustard amber-yellow paper delivery bag with bold black italic wordmark 'JOLA' centered on it. An open bag overflowing with two realistic cold brown glass beer bottles with plain cream labels, green bottle, red cola can, plus blue bag of ice leaning on the right and an orange snack packet at left. Clear ice cubes scattered in foreground on a near black tabletop. Bag centered and entire composition contained within image with generous breathing room. Moody charcoal background #171815 seamless studio, amber side lighting, condensation on bottles, crisp tactile material, subtle film grain, appetizing premium beverage commercial photography. Slightly low camera angle, dynamic yet physically plausible arrangement. Color palette charcoal, warm mustard, cream, little red, glacial blue. No people, no UI, no slogans, no watermark, no text other than JOLA on bag. This is an actual photograph-inspired hero asset, not a web page mockup.

The generated image was inspected and optimized into WebP without editing the depicted content. OpenGraph imagery is generated locally using Next.js `ImageResponse` and the same typography/palette.
