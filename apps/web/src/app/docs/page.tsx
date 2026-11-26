'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Terminal,
  Shield,
  CheckCircle,
  Code,
  ArrowLeft,
  Layers,
  LifeBuoy,
  ArrowRightLeft,
} from 'lucide-react';
import { cn, Footer, Logo } from '@stellar-starter-kit/ui';
import { AppHeader } from '../../components/AppHeader';
import { REPO_URL } from '../../lib/constants';

const DOCS_SECTIONS = {
  intro: {
    title: 'Introduction',
    icon: <BookOpen className="h-4 w-4" />,
    content: (
      <div>
        <h1 className="text-foreground mb-6 text-3xl font-extrabold">Introduction</h1>
        <p className="text-foreground/80 mb-4 leading-relaxed">
          Welcome to <strong>Stellar Streams</strong> — an open-source protocol for continuous
          payment streams, linear vesting with cliffs, and proportional payment splits on Stellar
          and Soroban.
        </p>
        <p className="text-foreground/80 mb-4 leading-relaxed">
          The protocol is implemented as Soroban smart contracts written in Rust, with a typed
          TypeScript SDK, shared vesting math, and an open dashboard for creating and managing
          streams.
        </p>
        <div className="glass border-border my-8 rounded-2xl border p-6">
          <h3 className="text-foreground mb-2 text-base font-bold">Key Philosophy</h3>
          <ul className="text-muted-foreground space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-purple-400" /> Save days of workspace
              coordination and TS compilation setup.
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-purple-400" /> Enforce clean code boundaries with
              modular package isolation.
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-purple-400" /> Pre-configured wallet adapters for
              immediate ecosystem integration.
            </li>
          </ul>
        </div>
      </div>
    ),
  },
  setup: {
    title: 'Getting Started',
    icon: <Terminal className="h-4 w-4" />,
    content: (
      <div>
        <h1 className="text-foreground mb-6 text-3xl font-extrabold">Getting Started</h1>
        <p className="text-foreground/80 mb-6 leading-relaxed">
          Follow these instructions to configure your local machine for developing Stellar and
          Soroban smart contract applications.
        </p>

        <h3 className="text-foreground mb-3 text-lg font-bold">1. Clone & Install</h3>
        <pre className="border-border bg-secondary text-foreground/80 mb-6 overflow-x-auto rounded-xl border p-5 font-mono text-xs leading-relaxed">
          {`git clone ${REPO_URL}.git
cd stellar-streams
pnpm install
pnpm build`}
        </pre>

        <h3 className="text-foreground mb-3 text-lg font-bold">2. Run Local Horizon Node</h3>
        <p className="text-foreground/80 mb-4 text-sm leading-relaxed">
          We use the official Stellar Quickstart Docker image for local development to ensure fast
          transaction validation cycles. Run the helper script:
        </p>
        <pre className="border-border bg-secondary text-foreground/80 mb-6 overflow-x-auto rounded-xl border p-5 font-mono text-xs leading-relaxed">
          {`./scripts/setup-local-node.sh`}
        </pre>

        <h3 className="text-foreground mb-3 text-lg font-bold">3. Local RPC Endpoints</h3>
        <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="glass border-border rounded-xl border p-5">
            <span className="text-muted-foreground font-mono text-xs">Horizon Gateway API</span>
            <div className="text-foreground mt-1 text-sm font-semibold">http://localhost:8000</div>
          </div>
          <div className="glass border-border rounded-xl border p-5">
            <span className="text-muted-foreground font-mono text-xs">Soroban RPC Gateway</span>
            <div className="text-foreground mt-1 text-sm font-semibold">
              http://localhost:8000/soroban/rpc
            </div>
          </div>
        </div>
      </div>
    ),
  },
  troubleshooting: {
    title: 'Troubleshooting',
    icon: <LifeBuoy className="h-4 w-4" />,
    content: (
      <div>
        <h1 className="text-foreground mb-6 text-3xl font-extrabold">Troubleshooting</h1>
        <p className="text-foreground/80 mb-6 leading-relaxed">
          The same handful of causes accounts for most Testnet reports. Find the exact error text
          you saw below, then follow the full cause-and-fix write-up in the repository.
        </p>

        <div className="space-y-4">
          {[
            {
              error: 'Freighter wallet extension is not installed or enabled.',
              fix: 'Install and enable the wallet extension, then reload the page.',
            },
            {
              error: 'Simulation of create_stream failed: ...',
              fix: 'Your wallet is on the wrong network. Match it to the app (Testnet).',
            },
            {
              error: 'No stream contract id configured.',
              fix: 'Deploy the contracts and set NEXT_PUBLIC_STREAM_CONTRACT_ID, then rebuild.',
            },
            {
              error: 'Account not found',
              fix: 'Your account has no XLM for fees. Fund it with Friendbot.',
            },
            {
              error: 'RPC kept answering TRY_AGAIN_LATER for transaction ...',
              fix: 'The public RPC is rate-limiting you. Wait and retry, or use your own RPC.',
            },
          ].map((entry) => (
            <div key={entry.error} className="border-border bg-card rounded-xl border p-5">
              <code className="text-xs font-semibold break-all text-rose-300">{entry.error}</code>
              <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{entry.fix}</p>
            </div>
          ))}
        </div>

        <div className="glass border-border mt-8 rounded-2xl border p-6">
          <h3 className="text-foreground mb-2 text-base font-bold">Confirm the deployment first</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Many errors above mean the contracts are simply not deployed on the network you are
            using. The contract ids page lists the deployed <code>stream</code>, <code>splits</code>
            , and <code>escrow</code> ids with explorer links. Full entries for every symptom —
            including how to read that page — live in{' '}
            <a
              href="https://github.com/SorobanForge/stellar-streams/blob/main/docs/troubleshooting.md"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-cyan-400 hover:underline"
            >
              docs/troubleshooting.md
            </a>
            .
          </p>
        </div>
      </div>
    ),
  },
  architecture: {
    title: 'Architecture',
    icon: <Layers className="h-4 w-4" />,
    content: (
      <div>
        <h1 className="text-foreground mb-6 text-3xl font-extrabold">Workspace Architecture</h1>
        <p className="text-foreground/80 mb-6 leading-relaxed">
          The project is structured as a pnpm workspace monorepo. This allows private npm modules to
          be linked locally and built in parallel.
        </p>

        <div className="space-y-4">
          <div className="border-border bg-card rounded-xl border p-5">
            <h4 className="text-foreground text-sm font-bold">apps/web</h4>
            <p className="text-muted-foreground mt-1 text-xs">
              The frontend portal created with Next.js 15, React 19, and Framer Motion.
            </p>
          </div>
          <div className="border-border bg-card rounded-xl border p-5">
            <h4 className="text-foreground text-sm font-bold">packages/wallets</h4>
            <p className="text-muted-foreground mt-1 text-xs">
              Unified React providers and hooks wrapping Freighter, Albedo, Hana, Rabet, and Ledger
              wallets. See the{' '}
              <a
                href={`${REPO_URL}/blob/main/packages/wallets/README.md`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-cyan-400 hover:underline"
              >
                supported-wallet matrix and troubleshooting
              </a>{' '}
              for capabilities, mounting, and error handling.
            </p>
          </div>
          <div className="border-border bg-card rounded-xl border p-5">
            <h4 className="text-foreground text-sm font-bold">packages/sdk</h4>
            <p className="text-muted-foreground mt-1 text-xs">
              Official Stellar SDK abstraction layers, formatting tools, and RPC handlers.
            </p>
          </div>
          <div className="border-border bg-card rounded-xl border p-5">
            <h4 className="text-foreground text-sm font-bold">packages/ui</h4>
            <p className="text-muted-foreground mt-1 text-xs">
              Shared design tokens, custom components, and Tailwind config styles.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  contracts: {
    title: 'Smart Contracts',
    icon: <Code className="h-4 w-4" />,
    content: (
      <div>
        <h1 className="text-foreground mb-6 text-3xl font-extrabold">Soroban Smart Contracts</h1>
        <p className="text-foreground/80 mb-6 leading-relaxed">
          Soroban is a rust-based, high-performance smart contract engine built on top of Stellar.
        </p>

        <h3 className="text-foreground mb-3 text-lg font-bold">Prerequisites</h3>
        <p className="text-foreground/80 mb-4 text-sm leading-relaxed">
          To write, build, and deploy contracts, you must install the Rust toolchain and the cargo
          Soroban CLI.
        </p>
        <pre className="border-border bg-secondary text-foreground/80 mb-6 overflow-x-auto rounded-xl border p-5 font-mono text-xs leading-relaxed">
          {`# Install Rust (via rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Soroban CLI
cargo install --locked soroban-cli`}
        </pre>

        <h3 className="text-foreground mb-3 text-lg font-bold">Compilation & Deployment</h3>
        <pre className="border-border bg-secondary text-foreground/80 mb-6 overflow-x-auto rounded-xl border p-5 font-mono text-xs leading-relaxed">
          {`# Build WASM contract binaries
cargo build --target wasm32-unknown-unknown --release

# Deploy to Testnet
soroban contract deploy \\
  --wasm target/wasm32-unknown-unknown/release/my_contract.wasm \\
  --source default \\
  --network testnet`}
        </pre>
      </div>
    ),
  },
  pipelines: {
    title: 'CI/CD Pipelines',
    icon: <Shield className="h-4 w-4" />,
    content: (
      <div>
        <h1 className="text-foreground mb-6 text-3xl font-extrabold">CI/CD Pipelines</h1>
        <p className="text-foreground/80 mb-6 leading-relaxed">
          Our automated workflow gates ensure that no broken compilation code, vulnerability, or
          formatting style is merged.
        </p>

        <div className="my-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="glass border-border rounded-2xl border p-5">
            <h4 className="text-foreground mb-1.5 text-sm font-bold">PR Check</h4>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Runs on every Pull Request. Automates linting, prettier formatting, type checking, and
              builds.
            </p>
          </div>
          <div className="glass border-border rounded-2xl border p-5">
            <h4 className="text-foreground mb-1.5 text-sm font-bold">CodeQL Static Analysis</h4>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Scans repository files for code vulnerabilities, credentials, and structural bugs on
              push.
            </p>
          </div>
          <div className="glass border-border rounded-2xl border p-5">
            <h4 className="text-foreground mb-1.5 text-sm font-bold">Release Pipeline</h4>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Uses Changesets to calculate semantic version tags and publish changelogs to GitHub.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  migration: {
    title: 'Migration Guide',
    icon: <ArrowRightLeft className="h-4 w-4" />,
    content: (
      <div>
        <h1 className="text-foreground mb-6 text-3xl font-extrabold">Migration Guide</h1>
        <p className="text-foreground/80 mb-6 leading-relaxed">
          Migrating existing integrations from{' '}
          <code className="text-cyan-300">@stellar-starter-kit/*</code> to{' '}
          <code className="text-purple-300">@stellar-streams/*</code>.
        </p>

        <div className="glass border-border mb-8 rounded-2xl border p-6">
          <h3 className="text-foreground mb-3 text-base font-bold">Package Renaming Table</h3>
          <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
            All workspace packages have moved from the starter template scope to the dedicated
            Stellar Streams protocol scope.
          </p>
          <div className="overflow-x-auto">
            <table className="text-foreground/80 w-full text-left text-xs">
              <thead className="border-border text-muted-foreground border-b">
                <tr>
                  <th className="pb-2 font-semibold">Old Package</th>
                  <th className="pb-2 font-semibold">New Package</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y font-mono">
                <tr>
                  <td className="py-2 text-rose-400">@stellar-starter-kit/sdk</td>
                  <td className="py-2 text-emerald-400">@stellar-streams/sdk</td>
                </tr>
                <tr>
                  <td className="py-2 text-rose-400">@stellar-starter-kit/types</td>
                  <td className="py-2 text-emerald-400">@stellar-streams/types</td>
                </tr>
                <tr>
                  <td className="py-2 text-rose-400">@stellar-starter-kit/utils</td>
                  <td className="py-2 text-emerald-400">@stellar-streams/utils</td>
                </tr>
                <tr>
                  <td className="py-2 text-rose-400">@stellar-starter-kit/contracts</td>
                  <td className="py-2 text-emerald-400">@stellar-streams/contracts</td>
                </tr>
                <tr>
                  <td className="py-2 text-rose-400">@stellar-starter-kit/hooks</td>
                  <td className="py-2 text-emerald-400">@stellar-streams/hooks</td>
                </tr>
                <tr>
                  <td className="py-2 text-rose-400">@stellar-starter-kit/wallets</td>
                  <td className="py-2 text-emerald-400">@stellar-streams/wallets</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <h3 className="text-foreground mb-3 text-lg font-bold">Automated Codemod</h3>
        <p className="text-foreground/80 mb-4 text-sm leading-relaxed">
          Update all imports across your repository with a single shell command:
        </p>
        <pre className="border-border bg-secondary text-foreground/80 mb-6 overflow-x-auto rounded-xl border p-5 font-mono text-xs leading-relaxed">
          {`find . -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \\) \\
  -not -path "*/node_modules/*" \\
  -exec sed -i 's/@stellar-starter-kit\\//@stellar-streams\\//g' {} +`}
        </pre>

        <p className="text-muted-foreground text-sm">
          For full import mappings, behaviour changes, and codemod scripts, refer to the complete{' '}
          <a
            href="https://github.com/SorobanForge/stellar-streams/blob/main/docs/migration.md"
            target="_blank"
            rel="noreferrer"
            className="text-purple-400 underline hover:text-purple-300"
          >
            docs/migration.md
          </a>{' '}
          documentation.
        </p>
      </div>
    ),
  },
};

export default function Docs() {
  const [activeSection, setActiveSection] = useState<keyof typeof DOCS_SECTIONS>('intro');

  return (
    <div className="bg-background text-foreground min-h-screen selection:bg-purple-500/30 selection:text-purple-200">
      {/* Background glow mesh */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="animate-pulse-slow absolute top-[-10%] left-[-10%] h-[60%] w-[60%] rounded-full bg-purple-900/5 blur-[150px]"></div>
        <div
          className="animate-pulse-slow absolute right-[-10%] bottom-[-10%] h-[60%] w-[60%] rounded-full bg-cyan-900/5 blur-[150px]"
          style={{ animationDelay: '2s' }}
        ></div>
      </div>

      <AppHeader />

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          {/* Documentation Sidebar */}
          <aside className="flex flex-col gap-2 lg:col-span-3">
            <div className="mb-6 flex items-center gap-2 pl-4">
              <Logo size={16} className="text-purple-400" />
              <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
                Developer Docs
              </span>
            </div>

            {(Object.keys(DOCS_SECTIONS) as Array<keyof typeof DOCS_SECTIONS>).map((key) => (
              <button
                key={key}
                onClick={() => setActiveSection(key)}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all duration-150',
                  activeSection === key
                    ? 'text-foreground border-purple-500/25 bg-gradient-to-r from-purple-500/10 to-cyan-500/10 shadow-md'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground border-transparent bg-transparent',
                )}
              >
                {DOCS_SECTIONS[key].icon}
                {DOCS_SECTIONS[key].title}
              </button>
            ))}

            <div className="border-border mt-8 border-t pt-6">
              <Link
                href="/"
                className="text-muted-foreground hover:text-foreground flex items-center gap-2 pl-4 text-xs font-bold transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Landing Page
              </Link>
            </div>
          </aside>

          {/* Documentation Content Area */}
          <section className="border-border bg-card rounded-3xl border p-8 shadow-2xl md:p-12 lg:col-span-9">
            {DOCS_SECTIONS[activeSection].content}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
