# Fixed drinks, optional extras

The listed price is the complete default pack price, including extras. This follows the working assumption stated during implementation; these are preview prices, not verified supplier costs or margins.

| Pack         | Position  | Fixed core                                 | Default price |
| ------------ | --------- | ------------------------------------------ | ------------: |
| Só Mais Uma  | Primary   | 12 Super Bock 33 cl                        |        €21.90 |
| A Clássica   | Primary   | 24 Super Bock 33 cl + Eristoff 70 cl       |        €59.90 |
| O Pré        | Primary   | Eristoff 70 cl + 4 Red Bull 25 cl          |        €39.90 |
| Só Somersby  | Primary   | 16 Somersby Maçã 33 cl                     |        €34.90 |
| Gin & Chill  | Secondary | Gordon’s 70 cl + 3 Schweppes Tónica 1 L    |        €39.90 |
| Sem Ressacas | Secondary | 12 Super Bock 0.0 33 cl + 4 Red Bull 25 cl |        €34.90 |

Core quantities remain fixed. Super Bock/Sagres (including alcohol-free) swaps cost the same. Eristoff → Smirnoff and Gordon’s → Beefeater add €2 per pack. Gin & Chill's tonic belongs to the core and cannot be removed.

## Default extras and provisional deductions

| Extra                         | Contribution per unit |
| ----------------------------- | --------------------: |
| Gelo, 2 kg bag                |                 €1.50 |
| Coca-Cola / Zero / 7Up, 1.5 L |                 €1.50 |
| Doritos, 140 g                |                 €1.50 |
| Pringles, 165 g               |                 €2.00 |
| Water, 50 cl                  |                 €0.50 |
| Paper cup                     |                 €0.05 |
| Peanuts, 200 g                |                 €1.00 |
| Four limes                    |                 €1.00 |

These are discounted pack contributions, independent of individual catalogue retail prices. Controls show the change for the entire component, including its quantity. Doritos → Pringles adds €0.50 per snack; Coca-Cola → Zero/7Up costs the same. Removing an extra deducts its currently selected contribution; restoring it adds it back. Brand upgrades remain when extras are removed.

- Só Mais Uma: 1 ice, 1 snack, peanuts, 2 waters.
- A Clássica: 2 mixers, 2 ice, 2 snacks, peanuts, 25 cups, 6 waters.
- O Pré: 1 mixer, 2 ice, 1 snack, 20 cups, 4 waters.
- Só Somersby: 2 ice, 2 snacks, 6 waters.
- Gin & Chill: 2 ice, limes, 20 cups, 1 Pringles, 4 waters.
- Sem Ressacas: 1 mixer, 1 ice, 2 snacks, 6 waters, 20 cups.

The default snack is Doritos except in Gin & Chill. Fixed quantities within each extra keep customization quick. A customer may swap or remove an entire extra component; ordinary catalogue products supply additional quantities.

## Persistence and analytics

All prices use integer cents. `configurePack` calculates the default pack price plus selected contribution differences; API validation rejects unsupported options, invented values and core removal. Client-supplied money is ignored. A pack remains one line with one configuration per pack ID. Increasing quantity duplicates that configuration.

Order/lead snapshots include selected options, configured unit price, full contents, separate core/extra contents and removed-extra keys. Existing carts with beer/mixer choices receive the new defaults for additional options. Checkout identity includes every option, so a new configuration cannot reuse an old completed checkout.

Every actual control change records a structured swap/removal/restore event and before/after options and prices. Detail exploration is distinct from cart edits. Product and checkout events contain the selected configuration, configured price, default price, tier and removals. The dashboard exposes popular configuration actions separately from final basket demand.

Existing generated pack scenes remain illustrative: their depicted packaging/quantities do not change with customization. The textual configuration is authoritative. Replace them with supplier-approved photography before real sales.
