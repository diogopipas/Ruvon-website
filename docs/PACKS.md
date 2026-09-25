# Fixed drinks, optional extras

The displayed price is the sum of the default products, including extras. Prices are in euro cents internally and are preview values.

| Pack         | Fixed core                                  | Default extras                                         |  Price |
| ------------ | ------------------------------------------- | ------------------------------------------------------ | -----: |
| Só Mais Uma  | 12 Super Bock minis, 20 cl                  | Ice, Doritos, 6 waters, 10 cups                        | €14.70 |
| A Clássica   | 24 Super Bock minis, 20 cl; Eristoff, 70 cl | 2 Coca-Cola, ice, Doritos, Pringles, 6 waters, 20 cups | €46.65 |
| O Pré        | Eristoff, 70 cl; 4 Red Bull, 25 cl          | 2 Coca-Cola, ice, Doritos, 6 waters, 20 cups           | €35.03 |
| Só Somersby  | 16 Somersby, 33 cl                          | Ice, Doritos, Pringles, 6 waters, 20 cups              | €31.15 |
| Gin & Chill  | Gordon’s, 70 cl; 3 Schweppes Tónica, 1 L    | 4 limes, ice, Doritos, 6 waters, 20 cups               | €33.22 |
| Sem Ressacas | 12 Super Bock 0.0, 33 cl; 4 Red Bull, 25 cl | 2 Coca-Cola, ice, Doritos, Pringles, 6 waters, 20 cups | €34.31 |

| Product or extra                        |                  Price |
| --------------------------------------- | ---------------------: |
| 6 / 12 / 24 Super Bock minis, 20 cl     | €3.75 / €7.50 / €14.99 |
| Eristoff Vodka, 70 cl                   |                 €15.69 |
| Gordon’s Gin, 70 cl                     |                 €17.49 |
| 4 / 8 / 16 Somersby, 33 cl              | €4.99 / €9.98 / €19.96 |
| 6 / 12 Super Bock 0.0, 33 cl            |         €5.99 / €11.98 |
| Coca-Cola Original / Zero / 7Up, 1.75 L |  €2.39 / €1.99 / €2.09 |
| Schweppes Tónica, 1 L                   |                  €2.15 |
| 1 / 4 Red Bull, 25 cl                   |          €1.59 / €6.36 |
| Doritos, 225 g / Pringles, 175 g        |          €3.29 / €2.99 |
| Ice, 2 kg / 6 waters, 50 cl             |          €0.99 / €1.92 |
| 10 / 20 paper cups                      |          €1.00 / €2.00 |
| 4 limes                                 |    €1.08 (approximate) |

Core quantities remain fixed. Super Bock/Sagres (including alcohol-free) swaps cost the same. Eristoff → Smirnoff and Gordon’s → Beefeater add €2 per pack; alternative brand prices were not supplied. Tonic and Red Bull belong to the fixed core where listed. Default extras can be swapped or removed independently. Where a pack contains Doritos and Pringles, they are separate controls. Coca-Cola → Zero changes the pack by −€0.40 per bottle; Coca-Cola → 7Up by −€0.30. Doritos → Pringles changes it by −€0.30.

`configurePack` adds the differences between selected and default component values. API validation rejects unsupported options, invented values and core removal. Client-supplied prices are ignored. A pack remains one basket line with one configuration per pack ID; increasing quantity duplicates that configuration.

Order and lead snapshots include selected options, configured unit price, full contents, separate core and extra contents and removed-extra keys. Checkout identity includes every option. Every option change records a swap, removal or restoration event with before and after prices. Product and checkout events include the final configuration.

Generated pack scenes are illustrative and do not update with customization. The textual configuration is authoritative. New standalone sizes without matching product photography use the existing illustrated fallback until accurate photos are available.
