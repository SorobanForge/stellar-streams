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

## Threat Model

The contracts have not been audited. This section records what has been analysed and tested so
far, and the assumptions the contracts rely on.

### Reentrancy through token callbacks

**Threat.** Every contract moves funds through a SEP-41 token contract that it does not control:
the stream's `token`, the escrow's `token`, and the `token` passed to each splits `distribute`
call. A hostile token can run arbitrary code inside `transfer`, including a call back into the
contract that invoked it, while that contract is part-way through `withdraw`, `cancel`,
`release_escrow`, `refund_escrow`, `cancel_escrow`, `fund_escrow` or `distribute`. If that
callback could observe state from before the payout, it could withdraw the same vested balance
twice, or both release an escrow to the payee and refund it to the payer.

**Finding 1: the Soroban host rejects reentry.** Every cross-contract call, whether made with
`invoke_contract` or `try_invoke_contract`, runs with reentry prohibited. When a call targets a
contract that is already anywhere on the call stack, the host refuses it with
`Error(Context, InvalidAction)` ("Contract re-entry is not allowed") before any of that
contract's code runs. This covers indirect cycles too (stream → token → other contract →
stream). A reentrant call therefore never reaches the contract's checks at all, and so can't
spend anything.

**Finding 2: state is now written before outbound transfers.** Before this analysis, `withdraw`,
`cancel`, `release_escrow`, `refund_escrow` and `cancel_escrow` transferred tokens first and
recorded the new state afterwards. That was not exploitable given Finding 1, but it meant safety
rested on the host alone. These paths now follow checks-effects-interactions: `withdrawn`, the
cancelled schedule, or the escrow's final status is persisted before the token is called. If the
host guarantee were ever weakened, a callback would see the stream already debited or the escrow
already closed, and would fail the contracts' own `NothingToWithdraw`, `AlreadyCancelled` and
`AlreadyFinalized` checks.

Inbound pulls (`create_stream`, `fund_escrow`, and the first leg of `distribute`) still move
the funds before recording the claim they back, so that a stream or a funded escrow is never on
the ledger without its tokens.

**Finding 3: writing early is safe because invocations are atomic.** When a transfer fails,
including a token that panics because its callback was rejected, the whole invocation is rolled
back, including the state written before the transfer. A transfer that fails after the early
write cannot leave a stream marked as withdrawn or an escrow marked as finalized.

**No explicit reentrancy guard.** A storage-flag guard would duplicate what the host already
enforces, cost an extra ledger write on every call, and be rolled back by the same atomicity
it would rely on. We chose checks-effects-interactions ordering as the defence-in-depth layer
instead.

**Tests.** A shared `HostileTokenContract` test fixture implements `transfer` and, when armed,
makes a single call back into a chosen contract function before any balance moves. Each test
allows non-root auth, so `require_auth` would let the reentrant call through and the host's
reentry check is the only thing that can stop it. Each test asserts that the callback was
attempted and refused with the reentry error, that funds moved exactly once, and that stored
state is consistent afterwards.

| Contract | Outer call       | Reentrant call   |
| :------- | :--------------- | :--------------- |
| stream   | `withdraw`       | `withdraw`       |
| stream   | `withdraw`       | `cancel`         |
| stream   | `withdraw` (fee) | `withdraw`       |
| stream   | `cancel`         | `withdraw`       |
| stream   | `cancel`         | `cancel`         |
| escrow   | `fund_escrow`    | `fund_escrow`    |
| escrow   | `release_escrow` | `refund_escrow`  |
| escrow   | `release_escrow` | `release_escrow` |
| escrow   | `refund_escrow`  | `release_escrow` |
| escrow   | `cancel_escrow`  | `release_escrow` |
| splits   | `distribute`     | `distribute`     |

In these tests the token swallows the rejection and lets the outer call finish, which is the
stronger attack. Separate tests have the token let the rejection propagate instead, and confirm
that `withdraw`, `release_escrow` and `distribute` then roll back completely. A control test
aims the same callback at a second stream contract that is not on the call stack and confirms it
succeeds, which shows the refusals come from the reentry check and not from the fixture.

### Token trust assumptions

Reentrancy is the only token behaviour these defences cover. The contracts otherwise trust the
token to honour SEP-41:

- **A token can lie.** A `transfer` that moves nothing, or a `balance` that misreports, will
  break accounting for any position denominated in that token.
- **Fee-on-transfer or rebasing tokens are unsupported.** Accounting assumes `transfer` moves
  exactly `amount`, so `withdrawn` and escrow amounts will drift from real balances.
- **The damage stays within one token.** A contract's balance in a token lives in that token's
  own ledger, so a hostile token can only affect streams, escrows or distributions that are
  denominated in it. Senders choose the token, and integrators should check that it is the
  expected contract (for example, the Stellar Asset Contract for a classic asset) before
  creating a stream or escrow.
