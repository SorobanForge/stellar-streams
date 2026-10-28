# `@stellar-starter-kit/utils`

Formatting and vesting-math helpers shared across the Stellar Streams stack
(dashboard, SDK consumers, and any integrator UI). All monetary math uses
`bigint` so values above `Number.MAX_SAFE_INTEGER` never lose precision.

```bash
pnpm add @stellar-starter-kit/utils
```

---

## Exported helpers

Every helper below is exported from the package root.

### `toCsv(streams, columns): string`

Serializes records as RFC 4180 CSV with a header row. The `columns` array sets
both the header labels and the stable field order. Commas, quotes, and line
breaks are quoted and embedded quotes are doubled. `bigint` values and decimal
amount strings are emitted without numeric conversion.

```ts
toCsv(streams, ['id', 'recipient', 'totalAmount']);
```

### Constants

| Export            | Value         | Meaning                                        |
| :---------------- | :------------ | :--------------------------------------------- |
| `XLM_DECIMALS`    | `7`           | Decimal places of native XLM and of every SAC. |
| `STROOPS_PER_XLM` | `10_000_000n` | Stroops in one XLM (`10^7`), as a `bigint`.    |

### `formatAddress(address: string, chars = 4): string`

Shortens a public key for display (e.g. `GABC...XYZ1`). Returns the input
untouched when it is too short to shorten.

```ts
formatAddress('GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ', 6);
// 'GA7QYN...JVSGZ'
formatAddress('hello'); // 'hello' — returned unchanged
```

### `formatTokenAmount(raw: bigint | number | string, decimals: number): string`

Formats a raw on-chain amount (the token's smallest unit) into a human-readable
string. Trailing zeros in the fraction are trimmed; no rounding ever happens —
the value you pass is the value you get, digit for digit. Read `decimals` from
the token contract (`StreamsClient.getTokenMetadata`) rather than assuming 7.

```ts
formatTokenAmount(1_234_567n, 6); // '1.234567'
formatTokenAmount(123_456_789n, 7); // '12.3456789'
formatTokenAmount(5n, 7); // '0.0000005'
formatTokenAmount(-1_500_000n, 6); // '-1.5'
```

### `parseTokenAmount(amount: string | number, decimals: number): bigint`

Parses a human-readable amount into the smallest unit. Fractional digits
**beyond** `decimals` places are truncated toward zero (never rounded up) — see
[Precision guarantees](#precision-guarantees). Throws on anything that is not a
plain decimal number.

```ts
parseTokenAmount('250.5', 6); // 250_500_000n
parseTokenAmount('1', 7); // 10_000_000n
parseTokenAmount('0.00000009', 7); // 0n — sub-stroop digits are dropped
parseTokenAmount('-2.25', 2); // -225n
parseTokenAmount('1.2.3', 7); // throws: Invalid token amount
```

### `formatStroopsToXlm(stroops): string` / `parseXlmToStroops(xlm): bigint`

XLM-specific shorthands for `formatTokenAmount(raw, XLM_DECIMALS)` and
`parseTokenAmount(xlm, XLM_DECIMALS)`. Use the generic helpers for non-XLM
tokens.

```ts
formatStroopsToXlm(123_456_789n); // '12.3456789'
parseXlmToStroops('100'); // 1_000_000_000n
parseXlmToStroops('one'); // throws: Invalid XLM amount
```

`parseXlmToStroops` accepts a plain decimal string — an optional leading `-`,
digits, and at most one `.` — with optional surrounding whitespace. Number
inputs are expanded out of exponential notation before parsing, so numeric and
string inputs behave the same at small magnitudes. Fractional digits beyond
seven places are **truncated toward zero**, which means anything smaller than
one stroop parses to `0n` rather than throwing; validate positivity yourself
when zero is not acceptable.

| Input                | Result                                         |
| :------------------- | :--------------------------------------------- |
| `' 1.2 '`            | `12_000_000n` (surrounding whitespace is ok)   |
| `'.5'`               | `5_000_000n`                                   |
| `'1.'`               | `10_000_000n`                                  |
| `'0.00000001'`       | `0n` (sub-stroop precision is dropped)         |
| `'-0.00000001'`      | `0n` (truncation is toward zero, not `-1n`)    |
| `1e7` (number)       | `100_000_000_000_000n` (ten million XLM)       |
| `0.0000001` (number) | `1n` (exponent form is expanded, not rejected) |
| `'1e7'` (string)     | throws: scientific notation is not supported   |
| `NaN` / `Infinity`   | throws: expected a finite decimal number       |
| `''`, `'.'`, `'-'`   | throws: expected a plain decimal number        |

### `formatDuration(seconds: number): string`

Formats a duration in seconds into a compact string. Negative input is clamped
to `0`; the largest non-zero of days/hours/minutes is kept, and pure-seconds
durations render as `Ns`.

```ts
formatDuration(172_800); // '2d'
formatDuration(7_500); // '2h 5m'
formatDuration(45); // '45s'
formatDuration(-10); // '0s'
```

### `computeVestedAmount(schedule: VestingSchedule, now: number): bigint`

Linear vesting at timestamp `now`, using the same integer math as the on-chain
`stream` contract — see [Rust/TypeScript parity](#rusttypescript-parity).

```ts
const schedule = {
  totalAmount: 3_600_000_000n, // 360 XLM in stroops
  startTime: 1_700_000_000,
  endTime: 1_700_003_600,
  cliffTime: 1_700_000_600,
};

computeVestedAmount(schedule, 1_700_000_300); // 0n — before the cliff
computeVestedAmount(schedule, 1_700_001_800); // 1_800_000_000n — halfway
computeVestedAmount(schedule, 1_700_003_600); // 3_600_000_000n — fully vested
```

### `computeProgressBps(schedule: VestingSchedule, now: number): number`

How much of the stream has vested, in basis points (`0`–`10000`). Ignores the
cliff — it reports linear progress between `startTime` and `endTime`.

```ts
computeProgressBps(schedule, 1_700_000_000); // 0
computeProgressBps(schedule, 1_700_001_800); // 5000
computeProgressBps(schedule, 1_700_004_000); // 10_000
```

### `formatBps(bps: number): string`

Formats basis points as a percentage string, clamped to `0`–`10000`.

```ts
formatBps(2550); // '25.5%'
formatBps(10_000); // '100%'
formatBps(-5); // '0%'
```

### `VestingSchedule` (interface)

The schedule shape accepted by `computeVestedAmount` / `computeProgressBps`,
mirroring the on-chain `Stream` time fields:

```ts
interface VestingSchedule {
  totalAmount: bigint; // smallest unit of the stream's token
  startTime: number; // unix seconds
  endTime: number; // unix seconds
  cliffTime: number; // unix seconds
}
```

---

## Precision guarantees

These rules are part of the package's contract; they are what "precise" means
here.

- **Decimals range.** `decimals` must be an integer in `[0, 38]`. 38 is the
  number of significant decimal digits an `i128` can hold (the on-chain amount
  type); anything wider could not round-trip through the contract. Out-of-range
  values throw.
- **Truncation direction: toward zero.** Every conversion rounds _down in
  magnitude_, never up, for both signs:
  - `parseTokenAmount` drops fractional digits past `decimals`
    (`'0.00000009'` at 7 decimals → `0n`, `'-0.00000009'` → `0n`).
  - `computeVestedAmount` uses `bigint` division, which truncates toward zero —
    exactly like `i128` division in Rust, so a stream never vests _more_ than
    the linear curve.
- **The sub-stroop rule.** An amount smaller than one smallest unit (one stroop
  for XLM) is not representable on-chain. Parsing a sub-stroop fraction
  truncates it to `0` — it is never rounded up to a full stroop. Conversely,
  formatting never invents digits: the output has at most `decimals` fractional
  places, all of them real on-chain value.
- **Vesting dust.** Because vested amounts truncate, a stream's last few stroops
  only become withdrawable once `now >= endTime`, where `computeVestedAmount`
  returns `totalAmount` in full.
- **No IEEE-754 anywhere.** Inputs may be `number` for convenience, but they are
  converted via `String(number)` and then `bigint` — pass `bigint` or `string`
  for anything above `Number.MAX_SAFE_INTEGER` (2^53 − 1), since a `number`
  cannot represent it losslessly in the first place.

## Overflow limits

- **Per-value limit.** On-chain amounts are `i128`, whose maximum is
  `170141183460469231731687303715884105727`. This package's `bigint` math would
  happily go higher, but any value beyond `i128` cannot round-trip through the
  contract, so treat `i128::MAX` as the supported maximum amount.
- **Product limit.** `computeVestedAmount` computes `totalAmount * elapsed` as a
  single `bigint` product before dividing. That product must also fit in `i128`
  for the Rust `stream` contract to compute the same value
  (`total_amount * elapsed / duration` in `i128`). With `i128::MAX` amounts and
  multi-year durations this holds with a wide margin, but integrators combining
  extreme amounts and extreme durations should verify.
- **Seconds.** `startTime`/`endTime`/`cliffTime`/`now` are `number` unix
  seconds; they must be safe integers.

## Rust/TypeScript parity

The vesting math is implemented **once in Rust** and mirrored **once in
TypeScript**, with tests on both sides. The mirror pair is:

| TypeScript (this package)          | Rust (source of truth)                           |
| :--------------------------------- | :----------------------------------------------- |
| `computeVestedAmount`              | `vested_amount` in `contracts/stream/src/lib.rs` |
| `computeProgressBps`               | derived from the same linear curve               |
| `packages/utils/src/index.test.ts` | `contracts/stream/src/test.rs`                   |

**The parity contract:** if you change the vesting formula, rounding, or its
edge cases in `contracts/stream/src/lib.rs`, you **must** update
`packages/utils/src/index.ts` in the same pull request (and vice versa), and
regenerate/commit the contract test snapshots
(`contracts/stream/test_snapshots/`). A one-sided change silently desyncs the
dashboard's preview of "how much has vested" from what the chain will actually
pay out.

Formatting helpers (`formatTokenAmount`, `parseTokenAmount`, and the XLM
shorthands) have no Rust counterpart — the contracts store raw integers and never
format — but they share the truncation-toward-zero rule above so that a value
formatted and re-parsed is always identical to the original.
