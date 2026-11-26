import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ValidationError } from '@stellar-starter-kit/config';
import { Alert, Footer } from '@stellar-starter-kit/ui';
import { AppHeader } from './AppHeader';

export interface ConfigurationErrorProps {
  /** Validation errors from `parseEnvironment`; warnings are not rendered here. */
  errors: ValidationError[];
}

/**
 * Rendered instead of a dashboard page when the environment fails validation.
 *
 * Showing the parser's field-by-field messages is the point: the alternative —
 * quietly using the Testnet defaults — points a misconfigured deployment at the
 * wrong network or contract, and the first symptom is a confusing wallet or
 * simulation error much later.
 */
export default function ConfigurationError({ errors }: ConfigurationErrorProps) {
  return (
    <div className="bg-background text-foreground min-h-screen selection:bg-purple-500/30 selection:text-purple-200">
      <AppHeader />
      <main className="relative z-10 mx-auto max-w-3xl px-6 pt-12 pb-24">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to overview
        </Link>

        <h1 className="text-foreground mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Dashboard configuration error
        </h1>
        <p className="text-muted-foreground mt-3 text-lg font-light">
          This deployment&apos;s environment failed validation, so the dashboard stopped instead of
          falling back to the built-in Testnet defaults.
        </p>

        <Alert tone="error" title="Environment validation failed" className="mt-8">
          <ul className="space-y-2">
            {errors.map((error) => (
              <li key={`${error.field}:${error.message}`}>
                <code className="font-mono text-xs text-rose-700 dark:text-rose-200">
                  {error.field}
                </code>
                <span className="mt-1 block text-rose-800/80 dark:text-rose-100/80">
                  {error.message}
                </span>
              </li>
            ))}
          </ul>
        </Alert>

        <div className="border-border bg-card text-muted-foreground mt-8 space-y-2 rounded-2xl border p-6 text-sm">
          <p className="text-foreground font-semibold">How to fix it</p>
          <p>
            Each message names the variable to correct. Every problem is reported at once, so one
            pass is enough.
          </p>
          <p>
            Copy <code className="text-foreground/80 font-mono">apps/web/.env.example</code> to{' '}
            <code className="text-foreground/80 font-mono">apps/web/.env.local</code>, keep the
            network, RPC URL and passphrase consistent, then restart the dev server. Values are
            inlined at build time, so a deployed build needs a new build after the change.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
