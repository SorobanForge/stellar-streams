import type { ParseResult } from '@stellar-starter-kit/config';

/**
 * Read-only view of the dashboard's public network configuration.
 *
 * Only `NEXT_PUBLIC_*` values ever reach this component (that is all
 * `parseEnvironment` reads), so no server secret can be rendered here.
 */
export function NetworkSettings({ result }: { result: ParseResult }) {
  const errors = result.errors.filter((error) => error.severity === 'error');
  const warnings = result.errors.filter((error) => error.severity === 'warning');
  const config = result.success ? result.config : null;

  return (
    <div className="space-y-8">
      {!result.success && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200"
        >
          <p className="font-semibold">Environment validation failed</p>
          <p className="mt-1 font-light text-rose-200/80">
            Fix the variables below and rebuild. The app falls back to defaults only where noted;
            otherwise writes will fail.
          </p>
          <ul className="mt-3 space-y-1 font-mono text-xs">
            {errors.map((error) => (
              <li key={`${error.field}-${error.message}`}>
                <span className="font-bold">{error.field}</span>: {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
          <p className="font-semibold">Warnings</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {warnings.map((warning) => (
              <li key={`${warning.field}-${warning.message}`}>
                <span className="font-bold">{warning.field}</span>: {warning.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {config && (
        <>
          <section className="rounded-2xl border border-slate-900 bg-slate-950/40 p-6">
            <h2 className="mb-4 text-sm font-semibold tracking-wider text-slate-400 uppercase">
              Network
            </h2>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Setting label="Network" value={config.network} />
              <Setting label="Network passphrase" value={config.networkPassphrase} mono />
              <Setting label="Soroban RPC URL" value={config.sorobanRpcUrl} mono />
              <Setting label="Horizon URL" value={config.horizonUrl} mono />
              <Setting label="Explorer URL" value={config.expertUrl} mono />
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-900 bg-slate-950/40 p-6">
            <h2 className="mb-4 text-sm font-semibold tracking-wider text-slate-400 uppercase">
              Contracts
            </h2>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Setting label="Stream contract" value={config.streamContractId} mono />
              <Setting label="Splits contract" value={config.splitsContractId} mono />
              <Setting label="Escrow contract" value={config.escrowContractId} mono />
              <Setting label="Token contract" value={config.tokenContractId} mono />
            </dl>
          </section>

          <p className="text-xs font-light text-slate-500">
            This page only shows <code className="font-mono">NEXT_PUBLIC_*</code> values. Never put
            wallet secret keys or server credentials in a public environment variable.
          </p>
        </>
      )}
    </div>
  );
}

function Setting({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd
        className={`mt-1 break-all ${mono ? 'font-mono text-xs' : ''} ${
          value ? 'text-slate-200' : 'text-slate-500 italic'
        }`}
      >
        {value || 'Not configured'}
      </dd>
    </div>
  );
}
