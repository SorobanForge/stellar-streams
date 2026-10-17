# Security Policy

## Supported Versions

We actively support and patch security issues in the following versions of Stellar Streams:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

We take the security of our project seriously. If you find a security vulnerability, please do **not** report it publicly through GitHub issues. Instead, please follow the steps below:

1. Send an email to **ademolabuild@gmail.com** with details of the vulnerability.
2. Include a description of the vulnerability, steps to reproduce, and any potential exploits.
3. We will acknowledge receipt of your report within 48 hours and coordinate a fix.
4. We will release a security patch and public disclosure once the issue has been resolved.

Thank you for helping keep this project secure!

## Known Limitations

This section publicly documents accepted, non-critical security findings that
are covered by tests instead of immediate code changes, in line with our
disclosure process.

### Interaction with non-standard (hostile) token contracts

All three contracts (`stream`, `splits`, `escrow`) call
`token::Client::transfer` and treat a return from that call as proof that the
full requested amount moved, and they persist their own state (withdrawn /
cancelled / funded / status transitions) *after* the transfer. This is safe
against the Stellar Asset Contract, which traps on insufficient balance and
moves exactly the requested amount, but it is **not** safe against arbitrary
ERC-20-like or custom Soroban tokens. The behaviour today is pinned by the
`test_hostile_token_*` tests in each contract's `src/test.rs`, using the
reusable `HostileToken` in `contracts/test-support/test_support.rs` (silent
short transfers + armed one-shot re-entrant calls).

1. **Short transfers are trusted blindly (no partial mitigation).** A token
   that delivers less than requested while reporting success distorts
   accounting in every flow:
   - `stream`: `create_stream` records `total_amount` for funds that never
     fully arrived (later claims become phantom promises paid from whatever
     the contract actually holds); `withdraw` marks a claim fully settled even
     when the recipient received less; `cancel` refunds "unvested" amounts the
     sender may not fully get.
   - `splits`: `distribute` returns `Ok`, publishes its `SplitDistributed`
     event for the full amount, yet under-pays every recipient and can strand
     dust inside the contract.
   - `escrow`: `fund_escrow` marks an escrow `Funded` for an amount greater
     than the contract custodies; `release_escrow`/`refund_escrow` under-pay
     the counterparty while finalising the state.
   Impact: mis-settled balances and stranded funds when users point these
   contracts at non-SAC tokens. Recommended fix (not yet implemented):
   restrict or allow-list tokens (e.g. store an approved-token registry or
   require SAC behaviour), or wrap transfers with before/after `balance`
   delta assertions.

2. **Re-entry into the same contract is blocked — by the host, not by us.**
   The write-after-transfer ordering would in principle expose a
   pre-observation window (e.g. a re-entrant `withdraw` seeing
   `withdrawn` before it is persisted, or a re-entrant `fund_escrow` charging
   the payer twice). On Soroban this is not reachable through the token hook:
   the host forbids re-entering the *same* contract instance within one
   top-level invocation, so such attempts trap ("Contract re-entry is not
   allowed") and the **entire invocation rolls back atomically** — no funds
   move and no state survives the failed call. This is demonstrated for
   `withdraw`/`cancel` (stream) and `distribute` (splits) and `fund_escrow`
   (escrow) in the tests above. Note the dependency: the mitigation is a host
   invariant, so any future protocol change to same-contract re-entry rules
   would turn these orderings into live double-spend/double-charge bugs;
   adopting checks-effects-interactions (persist state before calling the
   token, or verify deltas after) would remove the reliance.

3. **DoS of payout paths via trapping tokens.** A hostile (or simply
   broken/malicious) token can revert any transfer and thereby block
   `withdraw`, `cancel`, `distribute` or escrow finalisation for affected
   streams. Because Soroban rolls the failed invocation back completely, a
   token that keeps re-entry armed in a test harness poisons subsequent calls
   until disarmed; with a real token this reduces to the generic "the token
   itself refuses the transfer" denial, which users control by choosing the
   token they fund streams with.

4. **Milestone (tranche) streams use a separate cancellation path.** The
   linear `cancel` rejects milestone streams with `UseMilestoneCancel`;
   milestone custody is only refundable through `cancel_milestones`. Callers
   integrating with both stream types must handle the typed error; no funds
   can be stranded by the wrong path (the wrong call simply fails).

These limitations are documented rather than tracked as public GitHub issues;
fixes should be coordinated through the private reporting channel above so
that any exploitation guidance does not reach integrators before a patched
contract is deployed.

