## Description

Test-only shared mock wallet for the adapter tests, replacing the hand-rolled per-suite fakes in Freighter, Albedo and Rabet. Records the provider calls the adapters actually make in \`wallet.calls\`, so the suites assert behaviour by the calls they emit rather than against framework mock callbacks.

## Related issues

Closes #206
Closes #207
Closes #210
Closes #224
Closes #362
