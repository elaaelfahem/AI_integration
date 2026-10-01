# Offer recommender

This stage maps scored, eligible companies to the eight Orange offer families named in the MVP specification: Mobile, Broad Band, Data, WiFi, VoIP, MSSP, Bulk SMS, and Office 365.

The current specification does not define prices, bandwidth, allowances, contractual eligibility, or product variants. The workflow therefore returns `commercial_details: null` and `needs_commercial_confirmation: true`. These fields can only be populated after an official versioned Orange catalog is supplied.

Only companies with `scoring.ready_for_offer_recommendation: true` can receive recommendations. Every recommendation contains matched evidence signals and an independently validated offer identifier.

Endpoint: `POST /webhook/dme/recommend-offers`.
