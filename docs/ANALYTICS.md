# Analytics contract

The single entry point is `track(name, properties)` in `lib/analytics.ts`. It posts to `/api/events` and dispatches a `jola:analytics` DOM event for a future provider adapter. Development builds also log structured events. No email, phone, name or street is included in event properties.

| Event                | Trigger                                   | Main properties                                                 |
| -------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `landing_view`       | Landing page mounts                       | UTM attribution                                                 |
| `order_cta_clicked`  | Hero/navbar/section order CTA             | `source`                                                        |
| `category_clicked`   | Landing category or catalogue chip        | `category`, `source`                                            |
| `product_viewed`     | At least 60% of a product card is visible | `product`, `category`                                           |
| `product_added`      | Add/increment a product or pack           | `product`, `category`, `quantity`, `basket_value`, `item_count` |
| `product_removed`    | Decrement/remove                          | `product`, `category`, `quantity`, `basket_value`, `item_count` |
| `cart_opened`        | Open drawer/cart control                  | `basket_value`, `item_count`                                    |
| `checkout_started`   | Continue from basket                      | `basket_value`, `item_count`                                    |
| `location_entered`   | Valid city/postcode saved                 | `city`, `postcode`, basket properties in checkout               |
| `waitlist_submitted` | Lead successfully persisted               | `city`, `postcode`, `basket_value`, `item_count`                |
| `share_clicked`      | Optional share CTA clicked                | `source`                                                        |

Every event has a UUID, server timestamp and anonymous `session_id`. `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content` are attached when available. A share click measures intent; it does not claim a message was sent.

`basket_value` is the subtotal in euros, while `basket_total`, `total` and all other database money columns use euro cents. A quantity is a catalog unit: one six-pack, one ice bag or one bundle is one article.

Example campaign URL:

```text
http://localhost:3000/?utm_source=instagram&utm_medium=paid_social&utm_campaign=lisboa_noite&utm_content=video_2347
```

`analytics_events` provides actual visitor/click counts for the MVP. `simulated_orders.reached_checkout` and `converted_to_lead` support durable conversion metrics even if an analytics request fails.

## Adding a provider

Keep existing event names and centralize the integration in `track` or a single listener. For example, a PostHog adapter can subscribe to the custom event and call `posthog.capture(detail.name, detail.properties)`. Configure any required consent behavior before adding advertising or third-party analytics. Never send contact form values through this event channel.

## Stored attribution

Explicitly tagged visits replace the previous campaign. Visits without campaign tags retain the existing attribution. The server validates string lengths and does not accept arbitrary event properties. Neither contact submission nor cart sync trusts client-provided prices.
