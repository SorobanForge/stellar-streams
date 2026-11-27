import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Settings } from 'lucide-react';
import { Footer, Header } from '@stellar-starter-kit/ui';
import { parseEnvironment } from '@stellar-starter-kit/config';
import { NetworkSettings } from '../../components/NetworkSettings';

export const metadata: Metadata = {
  title: 'Network settings · Stellar Streams',
  description: 'Read-only view of the network, RPC endpoints and contract ids used by this build.',
};

/**
 * Read-only diagnostics for support requests: which network, which endpoints
 * and which contract ids this deployment is configured with.
 */
export default function SettingsPage() {
  // Server component: `parseEnvironment` reads the runtime environment, keeps
  // only NEXT_PUBLIC_* values, and reports every validation problem at once.
  const result = parseEnvironment(process.env);

  return (
    <div className="min-h-screen bg-[#06060c] text-slate-100 selection:bg-purple-500/30 selection:text-purple-200">
      <Header />
      <main className="relative z-10 mx-auto max-w-4xl px-6 pt-12 pb-24">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to overview
        </Link>

        <div className="mt-6 mb-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 px-3 py-1 text-xs font-semibold tracking-wide text-purple-300">
            <Settings className="h-3.5 w-3.5" /> Diagnostics
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Network &amp; settings
          </h1>
          <p className="mt-3 max-w-2xl text-lg font-light text-slate-400">
            Read-only values from this build&apos;s public environment. Share this page when
            reporting an issue so the network and contract ids are known.
          </p>
        </div>

        <NetworkSettings result={result} />
      </main>
      <Footer />
    </div>
  );
}
