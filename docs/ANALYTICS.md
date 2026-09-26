# Analytics contract

The single entry point is `track(name, properties)` in `lib/analytics.ts`. It posts to `/api/events` and dispatches a `jola:analytics` DOM event for a future provider adapter. Development builds also log structured events. No email, phone, name or street is included in event properties.

Vercel Web Analytics separately measures page views through the `Analytics` component in the root layout. Jola's custom events below remain in its own storage; they are not forwarded to Vercel.

| Event                | Trigger                                                          | Main properties                                                 |
| -------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| `landing_view`       | First landing-page mount in a tab journey                        | UTM attribution                                                 |
| `order_cta_clicked`  | Hero/navbar/section order CTA                                    | `source`                                                        |
| `category_clicked`   | Landing category or catalogue chip                               | `category`, `source`                                            |
| `product_viewed`     | At least 60% of a product card is visible after age confirmation | `product`, `category`                                           |
| `product_added`      | Add/increment a product or pack                                  | `product`, `category`, `quantity`, `basket_value`, `item_count` |
| `product_removed`    | Decrement/remove                                                 | `product`, `category`, `quantity`, `basket_value`, `item_count` |
| `cart_opened`        | Open drawer/cart control                                         | `basket_value`, `item_count`                                    |
| `checkout_started`   | Continue from basket                                             | `basket_value`, `item_count`                                    |
| `location_entered`   | Valid city saved                                                 | `city`, basket properties in checkout                           |
| `waitlist_submitted` | Lead successfully persisted                                      | `city`, `basket_value`, `item_count`                            |

Every event has a UUID, server timestamp and anonymous `session_id`. `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content` are attached when available.

The anonymous `session_id` is a browser-profile identifier persisted in local storage, not a new visit or a known person. `trackOnce` deduplicates lifecycle events and product impressions within a tab, including reloads, using session storage with an in-memory fallback. Each product has its own impression key. Repeated intentional add/remove/category/cart actions remain separate events. Delivery is best effort; this is not an exactly-once analytics pipeline.

`basket_value` is the subtotal in euros, while `basket_total`, `total` and all other database money columns use euro cents. A quantity is a catalog unit: one six-pack, one ice bag or one bundle is one article.

Example campaign URL:

```text
http://localhost:3000/?utm_source=instagram&utm_medium=paid_social&utm_campaign=lisboa_noite&utm_content=video_2347
```

`analytics_events` records observed interactions. The dashboard's main demand funnel uses saved simulated orders: started baskets → reached checkout → converted to contact. `simulated_orders.reached_checkout` and `converted_to_lead` support durable conversion metrics even if an analytics request fails. Pedido → Checkout is reached checkouts divided by started orders; Checkout → Contacto is converted orders divided by reached checkouts. City-only signups count as contacts but are excluded from these order-funnel rates.

Product and category demand is based on quantities in saved baskets, not add-button clicks. Basket values are simulated demand, not revenue. An empty city-only signup does not create an order or erase a previously saved lead basket.

Campaign conversion requires a saved lead for the same anonymous session and matching source, medium and campaign. A later campaign visit cannot receive credit for an earlier campaign's lead. This is a current-state, browser-level demand model, not visit-based or multi-touch attribution; use the raw events when investigating a journey over time.

## Adding a provider

Keep existing event names and centralize the integration in `track` or a single listener. For example, a PostHog adapter can subscribe to the custom event and call `posthog.capture(detail.name, detail.properties)`. Configure any required consent behavior before adding advertising or third-party analytics. Never send contact form values through this event channel.

## Stored attribution

Explicitly tagged visits replace the previous campaign. Visits without campaign tags retain the existing attribution. The server validates string lengths and does not accept arbitrary event properties. Neither contact submission nor cart sync trusts client-provided prices.

## Pack validation

Pack `product_viewed`, `product_added` and `product_removed` events carry `product_type: "pack"`, `pack_id`, `pack_name`, `pack_price` (configured euros), `default_pack_price`, `pack_tier`, `people_min`, `people_max` and `selected_options`. Individual products carry `product_type: "individual"`. Pack impressions require age confirmation and 10% of the pack image to be visible, or opening its detail. Adding through any path also records an implied view when one has not been sent. Impressions are deduplicated per pack/tab; add/remove actions are emitted centrally by the cart provider.

`cart_opened`, `checkout_started` and `waitlist_submitted` include `contains_pack` and a `packs` array containing the same metadata plus quantity. Checkout-start deduplication includes the basket and substitutions. `pack_options_changed` records each deliberate swap/removal/restore in detail or cart, including drafts that are later closed without saving. It carries `previous_options`, `selected_options`, `changed_options`, structured `changes` (`option`, `from`, `to`, `action`), `removed_extras`, `previous_pack_price`, `pack_price` and `price_delta`. `source` distinguishes `detail` exploration from `cart` edits. Clicking an already selected choice emits nothing; saving a detail draft does not emit a duplicate change. Initial/default choices and final configurations are carried by product and basket lifecycle events. `pack_group_selected` records the optional `group_size` choice (`2-3`, `4-6`, `7+`, or reset `all`).

The protected dashboard reports:

- The five demand KPIs, order-to-checkout and checkout-to-contact rates, filtered across the entire panel by Todas, Faro or Lisboa. Pre-location events inherit their browser's saved city. Unknown-city sessions are shown only under Todas.
- Campaign / city rows grouped by `utm_campaign`, `utm_content`, `utm_source` and city. Each saved order or contact counts under its own stored attribution. AOV is nonempty basket subtotal divided by nonempty baskets; simulated GMV sums current basket totals including fees. City-only contacts have no order.
- Percentage of nonempty saved carts with at least one pack, most selected pack by units, pack and non-pack AOV excluding fees, and checkout rate per pack (saved checkouts containing it divided by nonempty saved carts containing it).
- Most removed extras, selected extras and non-default brand/product swaps from final pack options in saved carts, weighted by pack quantity. Exploratory option clicks are tracked separately and do not inflate final-choice demand.
- Latest non-reset group-size choice per browser profile.
- Individual additions while a pack was already in the basket (`after_pack: true`). This action count does not subtract later removals.

Best-effort event view/add counts include saved carts as a floor: a persisted pack proves the browser viewed/added it even if `/api/events` failed. This prevents a zero event rate beside checkouts that contain packs. The dashboard uses saved cart state for its pack KPIs rather than presenting those event rates.

Options and a canonical contents snapshot live inside the existing JSON basket fields in orders and leads. No new SQL columns are required. Existing installations still need migration 002 from the previous audit.
