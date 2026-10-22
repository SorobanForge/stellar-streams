#![no_std]

/// Interface version exposed by every contract's `version()` view.
///
/// This is the single source of truth for the version of the contract
/// interfaces: bump it once when a release changes them, and `stream`,
/// `splits`, and `escrow` all report the new value.
pub const CONTRACT_VERSION: u32 = 1;
