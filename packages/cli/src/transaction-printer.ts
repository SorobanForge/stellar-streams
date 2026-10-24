/* eslint-disable no-console */

/**
 * Prints dry-run transaction details without submitting.
 */
export function outputDryRun(command: string, details: string): void {
  console.log('\n=== DRY RUN ===');
  console.log(`Command: ${command}`);
  console.log(`Details:\n${details}`);
  console.log('\n(This transaction was NOT submitted.)\n');
}
