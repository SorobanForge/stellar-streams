# Contracts Documentation

Welcome to the Stellar Streams smart contracts documentation.

## Splits Contract

The splits contract allows users to configure immutable, reusable splits with proportional shares. Anyone can pay into a split, and funds are distributed on the spot. For more details on how rounding dust is handled, see the [Splits Rounding Worked Example](#splits-rounding-worked-example).

---

## Splits Rounding Worked Example

When distributing an amount that does not divide evenly among recipients using integer arithmetic, integer division leaves behind rounding dust (remainders). To ensure that no funds are stranded in the contract, the splits contract assigns any rounding dust to the final recipient.

This section provides a worked example demonstrating how integer math works per recipient, and how `recipient_share` and `distribute` agree.

### Scenario

- **Recipients:** 3 recipients with shares `[1, 1, 1]`
- **Total Shares:** $1 + 1 + 1 = 3$
- **Amount to Distribute:** `10` stroops (e.g., does not divide evenly by 3)

### Step-by-Step Integer Math per Recipient

The contract iterates through each recipient at index `i` and calculates their portion using integer division: `amount * share / total_shares`. For the final recipient, any previously distributed amount is subtracted from the total `amount` to capture all rounding dust.

1. **Recipient 0 (Share = 1):**
   - Formula: `10 * 1 / 3 = 3.333...`
   - Integer arithmetic: `10 * 1 / 3 = 3`
   - Amount distributed so far: `3`

2. **Recipient 1 (Share = 1):**
   - Formula: `10 * 1 / 3 = 3.333...`
   - Integer arithmetic: `10 * 1 / 3 = 3`
   - Amount distributed so far: `3 + 3 = 6`

3. **Recipient 2 (Final Recipient, Share = 1):**
   - Because this is the final recipient (`index == len - 1`), the contract assigns the remaining balance:
   - Formula: `amount - distributed`
   - Calculation: `10 - 6 = 4`

### Agreement Between `recipient_share` and `distribute`

Both `distribute` and `recipient_share` rely on the helper function `recipient_portion`, ensuring they produce identical results:

- `recipient_share(env, split_id, index=0, amount=10)` returns `3`
- `recipient_share(env, split_id, index=1, amount=10)` returns `3`
- `recipient_share(env, split_id, index=2, amount=10)` returns `4`

When `distribute` is called with `10` stroops, the exact same amounts `[3, 3, 4]` are transferred to Recipients 0, 1, and 2 respectively, summing to a total of `10` stroops with zero dust stranded.
