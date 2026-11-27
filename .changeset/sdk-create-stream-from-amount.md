---
'@stellar-starter-kit/sdk': minor
---

Add `StreamsClient.createStreamFromAmount(params, opts?)`, which accepts a
human-readable decimal string and scales it by the token's own `decimals` read
from the cached `getTokenMetadata` — no extra metadata round trip for repeat
calls with the same token. Fractional digits beyond the token's precision are
truncated, and an amount that scales to zero or outside `i128` is rejected
before signing. The stroop-based `createStream` is unchanged.
