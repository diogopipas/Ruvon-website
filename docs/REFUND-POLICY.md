# Pilot refund policy and implementation limits

This records the requested pilot policy; it is not a published or legally approved trading agreement. Live checkout remains disabled until terms, merchant recovery agreements and provider behaviour are verified. See [status](IMPLEMENTATION-STATUS.md).

Before merchant acceptance, rejection, stock unavailability, timeout or customer cancellation closes the whole order. Void an uncaptured authorisation; after confirmed capture refund the full product, service and delivery amount. Do not mark cancellation/refund complete while a provider outcome or active physical delivery is unresolved.

After acceptance, customer cancellation becomes a review request. After pickup, physical recovery follows an approved safe return process; no blind cancellation/replacement is performed. Customer unavailability, age refusal/intoxication, damaged/wrong/missing goods and return conditions require a recorded resolution and liability decision. Unavailable contents never trigger a substitution or partial fulfilment in the pilot.

Partial refunds require a named administrator, reason, explicit product/service/delivery allocation and confirmation. Reserve the balance transactionally before calling Easypay. Successful, processing and unknown refunds all reduce the remaining refundable balance; a confirmed failed refund releases its reservation. The sum cannot exceed captured funds or the remaining value of any component. The original capture remains paid; refunded summaries are calculated separately.

The adapter refunds the customer without assuming per-split partial-value reversal or a merchant bank debit. Merchant recovery is a separate case, especially after clearing. Approved customer resolution needs Ruvon's available funding and a verified provider procedure. Insufficient balances, fees, split reversion and chargebacks remain account verification gates. Never infer bank payout or recovery from a split's status.

Restock only quantities explicitly confirmed saleable by the merchant after a verified return. Preserve seals, provider references, outcome/time and approved condition records. Never retain identification images, numbers or dates of birth.

Named admins can resolve cases with an audited reason and summary; guarded resume checks uncertainty and physical/payment facts. Merchants record return condition and saleable quantities through the dashboard. Neither action automatically decides an unapproved customer refund or establishes merchant recovery.

Current gaps: verified chargeback ingestion, recovery accounting, private evidence upload/access and the full exception suite remain outstanding. These gaps prevent production pilot acceptance.
