'use client';

import React, { useState } from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import Logo from '../../components/Logo';
import Link from 'next/link';
import { BookOpen, Terminal, Shield, CheckCircle, Code, ArrowLeft, Layers } from 'lucide-react';
import { cn } from '@stellar-starter-kit/ui';
import { REPO_URL } from '../../lib/constants';

const DOCS_SECTIONS = {
  intro: {
    title: 'Introduction',
    icon: <BookOpen className="h-4 w-4" />,
    content: (
      <div>
        <h1 className="mb-6 text-3xl font-extrabold text-white">Introduction</h1>
        <p className="text-slate-350 mb-4 leading-relaxed">
          Welcome to <strong>Stellar Streams</strong> — an open-source protocol for continuous
          payment streams, linear vesting with cliffs, and proportional payment splits on Stellar
          and Soroban.
        </p>
        <p className="text-slate-350 mb-4 leading-relaxed">
          The protocol is implemented as Soroban smart contracts written in Rust, with a typed
          TypeScript SDK, shared vesting math, and an open dashboard for creating and managing
          streams.
        </p>
        <div className="glass my-8 rounded-2xl border border-slate-900 p-6">
          <h3 className="mb-2 text-base font-bold text-white">Key Philosophy</h3>
          <ul className="space-y-2 text-sm text-slate-400">
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
        <h1 className="mb-6 text-3xl font-extrabold text-white">Getting Started</h1>
        <p className="text-slate-350 mb-6 leading-relaxed">
          Follow these instructions to configure your local machine for developing Stellar and
          Soroban smart contract applications.
        </p>

        <h3 className="mb-3 text-lg font-bold text-white">1. Clone & Install</h3>
        <pre className="mb-6 overflow-x-auto rounded-xl border border-slate-900 bg-[#08080f] p-5 font-mono text-xs leading-relaxed text-slate-300">
          {`git clone ${REPO_URL}.git
cd stellar-streams
pnpm install
pnpm build`}
        </pre>

        <h3 className="mb-3 text-lg font-bold text-white">2. Run Local Horizon Node</h3>
        <p className="text-slate-350 mb-4 text-sm leading-relaxed">
          We use the official Stellar Quickstart Docker image for local development to ensure fast
          transaction validation cycles. Run the helper script:
        </p>
        <pre className="mb-6 overflow-x-auto rounded-xl border border-slate-900 bg-[#08080f] p-5 font-mono text-xs leading-relaxed text-slate-300">
          {`./scripts/setup-local-node.sh`}
        </pre>

        <h3 className="mb-3 text-lg font-bold text-white">3. Local RPC Endpoints</h3>
        <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="glass rounded-xl border border-slate-900 p-5">
            <span className="font-mono text-xs text-slate-500">Horizon Gateway API</span>
            <div className="mt-1 text-sm font-semibold text-white">http://localhost:8000</div>
          </div>
          <div className="glass rounded-xl border border-slate-900 p-5">
            <span className="font-mono text-xs text-slate-500">Soroban RPC Gateway</span>
            <div className="mt-1 text-sm font-semibold text-white">
              http://localhost:8000/soroban/rpc
            </div>
          </div>
        </div>
      </div>
    ),
  },
  architecture: {
    title: 'Architecture',
    icon: <Layers className="h-4 w-4" />,
    content: (
      <div>
        <h1 className="mb-6 text-3xl font-extrabold text-white">Workspace Architecture</h1>
        <p className="text-slate-350 mb-6 leading-relaxed">
          The project is structured as a pnpm workspace monorepo. This allows private npm modules to
          be linked locally and built in parallel.
        </p>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-900 bg-slate-950/20 p-5">
            <h4 className="text-sm font-bold text-white">apps/web</h4>
            <p className="mt-1 text-xs text-slate-400">
              The frontend portal created with Next.js 15, React 19, and Framer Motion.
            </p>
          </div>
          <div className="rounded-xl border border-slate-900 bg-slate-950/20 p-5">
            <h4 className="text-sm font-bold text-white">packages/wallets</h4>
            <p className="mt-1 text-xs text-slate-400">
              Unified React providers and hooks wrapping Freighter, Albedo, Hana, and Rabet wallets.
            </p>
          </div>
          <div className="rounded-xl border border-slate-900 bg-slate-950/20 p-5">
            <h4 className="text-sm font-bold text-white">packages/sdk</h4>
            <p className="mt-1 text-xs text-slate-400">
              Official Stellar SDK abstraction layers, formatting tools, and RPC handlers.
            </p>
          </div>
          <div className="rounded-xl border border-slate-900 bg-slate-950/20 p-5">
            <h4 className="text-sm font-bold text-white">packages/ui</h4>
            <p className="mt-1 text-xs text-slate-400">
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
        <h1 className="mb-6 text-3xl font-extrabold text-white">Soroban Smart Contracts</h1>
        <p className="text-slate-350 mb-6 leading-relaxed">
          Soroban is a rust-based, high-performance smart contract engine built on top of Stellar.
        </p>

        <h3 className="mb-3 text-lg font-bold text-white">Prerequisites</h3>
        <p className="text-slate-350 mb-4 text-sm leading-relaxed">
          To write, build, and deploy contracts, you must install the Rust toolchain and the cargo
          Soroban CLI.
        </p>
        <pre className="mb-6 overflow-x-auto rounded-xl border border-slate-900 bg-[#08080f] p-5 font-mono text-xs leading-relaxed text-slate-300">
          {`# Install Rust (via rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Soroban CLI
cargo install --locked soroban-cli`}
        </pre>

        <h3 className="mb-3 text-lg font-bold text-white">Compilation & Deployment</h3>
        <pre className="mb-6 overflow-x-auto rounded-xl border border-slate-900 bg-[#08080f] p-5 font-mono text-xs leading-relaxed text-slate-300">
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
        <h1 className="mb-6 text-3xl font-extrabold text-white">CI/CD Pipelines</h1>
        <p className="text-slate-350 mb-6 leading-relaxed">
          Our automated workflow gates ensure that no broken compilation code, vulnerability, or
          formatting style is merged.
        </p>

        <div className="my-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="glass rounded-2xl border border-slate-900 p-5">
            <h4 className="mb-1.5 text-sm font-bold text-white">PR Check</h4>
            <p className="text-xs leading-relaxed text-slate-400">
              Runs on every Pull Request. Automates linting, prettier formatting, type checking, and
              builds.
            </p>
          </div>
          <div className="glass rounded-2xl border border-slate-900 p-5">
            <h4 className="mb-1.5 text-sm font-bold text-white">CodeQL Static Analysis</h4>
            <p className="text-xs leading-relaxed text-slate-400">
              Scans repository files for code vulnerabilities, credentials, and structural bugs on
              push.
            </p>
          </div>
          <div className="glass rounded-2xl border border-slate-900 p-5">
            <h4 className="mb-1.5 text-sm font-bold text-white">Release Pipeline</h4>
            <p className="text-xs leading-relaxed text-slate-400">
              Uses Changesets to calculate semantic version tags and publish changelogs to GitHub.
            </p>
          </div>
        </div>
      </div>
    ),
  },
};

export default function Docs() {
  const [activeSection, setActiveSection] = useState<keyof typeof DOCS_SECTIONS>('intro');

  return (
    <div className="min-h-screen bg-[#06060c] text-slate-100 selection:bg-purple-500/30 selection:text-purple-200">
      {/* Background glow mesh */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="animate-pulse-slow absolute top-[-10%] left-[-10%] h-[60%] w-[60%] rounded-full bg-purple-900/5 blur-[150px]"></div>
        <div
          className="animate-pulse-slow absolute right-[-10%] bottom-[-10%] h-[60%] w-[60%] rounded-full bg-cyan-900/5 blur-[150px]"
          style={{ animationDelay: '2s' }}
        ></div>
      </div>

      <Header />

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          {/* Documentation Sidebar */}
          <aside className="flex flex-col gap-2 lg:col-span-3">
            <div className="mb-6 flex items-center gap-2 pl-4">
              <Logo size={16} className="text-purple-400" />
              <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">
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
                    ? 'border-purple-500/25 bg-gradient-to-r from-purple-500/10 to-cyan-500/10 text-white shadow-md'
                    : 'border-transparent bg-transparent text-slate-400 hover:bg-slate-900/20 hover:text-slate-200',
                )}
              >
                {DOCS_SECTIONS[key].icon}
                {DOCS_SECTIONS[key].title}
              </button>
            ))}

            <div className="mt-8 border-t border-slate-900 pt-6">
              <Link
                href="/"
                className="flex items-center gap-2 pl-4 text-xs font-bold text-slate-400 transition-colors hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Landing Page
              </Link>
            </div>
          </aside>

          {/* Documentation Content Area */}
          <section className="rounded-3xl border border-slate-900 bg-[#08080f]/50 p-8 shadow-2xl md:p-12 lg:col-span-9">
            {DOCS_SECTIONS[activeSection].content}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
