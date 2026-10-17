'use client';

import React from 'react';
import Link from 'next/link';
import { Droplets, Split, Clock, ShieldCheck, ArrowRight, Github } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';

const FEATURES = [
  {
    icon: <Droplets className="h-5 w-5 text-cyan-400" />,
    title: 'Continuous streams',
    body: 'Lock tokens once and let them vest by the ledger. Recipients withdraw whatever has vested, whenever they want.',
  },
  {
    icon: <Clock className="h-5 w-5 text-purple-400" />,
    title: 'Cliffs & vesting',
    body: 'Add a cliff for milestone-based grants, salaries, or token unlocks. Vesting is linear between start and end.',
  },
  {
    icon: <Split className="h-5 w-5 text-emerald-400" />,
    title: 'Payment splits',
    body: 'Route a payment to many recipients in proportional shares in a single transaction, with dust handling built in.',
  },
  {
    icon: <ShieldCheck className="h-5 w-5 text-amber-400" />,
    title: 'Cancel-safe',
    body: 'Cancelling refunds the unvested balance to the sender while the recipient keeps everything already vested.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#06060c] text-slate-100 selection:bg-purple-500/30 selection:text-purple-200">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] h-[60%] w-[60%] rounded-full bg-purple-900/10 blur-[150px]"></div>
        <div className="absolute right-[-10%] bottom-[-10%] h-[60%] w-[60%] rounded-full bg-cyan-900/10 blur-[150px]"></div>
      </div>

      <Header />

      <main className="relative z-10">
        <section className="mx-auto max-w-5xl px-6 pt-24 pb-16 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-300">
            <Droplets className="h-3.5 w-3.5" /> Stellar Streams Protocol
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            Programmable payments on Stellar
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed font-light text-slate-400">
            Continuous payment streams, linear vesting with cliffs, and proportional payment splits
            — implemented as audited-ready Soroban contracts with a typed SDK and an open dashboard.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/streams"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
            >
              Launch the app <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://github.com/SorobanForge/stellar-streams"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-900"
            >
              <Github className="h-4 w-4" /> View source
            </a>
          </div>
        </section>

        <section id="protocol" className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-sm font-semibold tracking-wider text-slate-500 uppercase">
            What the protocol does
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-slate-900 bg-slate-950/40 p-6"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60">
                  {feature.icon}
                </div>
                <h3 className="text-sm font-bold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed font-light text-slate-400">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="sdk" className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-extrabold text-white">A typed SDK</h2>
              <p className="mt-4 text-sm leading-relaxed font-light text-slate-400">
                The <code className="font-mono text-cyan-300">@stellar-starter-kit/sdk</code>{' '}
                package wraps the `stream` contract with a fully typed client. Reads simulate
                against Soroban RPC; writes are prepared, signed by a connected wallet, and polled
                to completion.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                <li className="flex gap-2">
                  <span className="text-cyan-400">→</span> <code>createStream</code>,{' '}
                  <code>withdraw</code>, <code>cancel</code>
                </li>
                <li className="flex gap-2">
                  <span className="text-cyan-400">→</span> <code>getStream</code>,{' '}
                  <code>claimable</code>, <code>vested</code>
                </li>
                <li className="flex gap-2">
                  <span className="text-cyan-400">→</span> Vesting math helpers in{' '}
                  <code>@stellar-starter-kit/utils</code>
                </li>
              </ul>
            </div>
            <pre className="overflow-x-auto rounded-2xl border border-slate-900 bg-[#08080f] p-6 font-mono text-xs leading-relaxed text-slate-300">
              {`import { StreamsClient } from '@stellar-starter-kit/sdk';

const client = new StreamsClient({
  contractId: STREAM_CONTRACT_ID,
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  publicKey: address,
  signTransaction,
});

const id = await client.createStream({
  sender: address,
  recipient,
  token: XLM_TOKEN,
  amount: '1000000000', // 100 XLM in stroops
  startTime: now,
  endTime: now + 30 * 86_400,
  cliffTime: now,
});`}
            </pre>
          </div>
        </section>

        <section id="roadmap" className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="text-center text-2xl font-extrabold text-white">Roadmap</h2>
          <div className="mt-8 space-y-4">
            {[
              ['Shipped', 'stream + splits contracts, typed SDK, dashboard, 29 contract tests.'],
              ['Next', 'Testnet deployments, milestone escrow module, event indexer.'],
              ['Later', 'Multi-token streams, Streams CLI, security audit.'],
            ].map(([stage, body]) => (
              <div
                key={stage}
                className="flex flex-col gap-1 rounded-xl border border-slate-900 bg-slate-950/30 p-5 sm:flex-row sm:items-center sm:gap-6"
              >
                <span className="w-20 text-xs font-bold tracking-wider text-cyan-300 uppercase">
                  {stage}
                </span>
                <span className="text-sm font-light text-slate-300">{body}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 pt-8 pb-24 text-center">
          <h2 className="text-2xl font-extrabold text-white">Read the docs</h2>
          <p className="mt-4 text-sm font-light text-slate-400">
            Setup, contract interfaces, deployment, and the contribution guide live in the
            repository.
          </p>
          <Link
            href="/docs"
            className="mt-8 inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-900"
          >
            Open documentation <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  );
}
