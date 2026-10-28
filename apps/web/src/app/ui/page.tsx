'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Droplets,
  ExternalLink,
  Info,
  Loader2,
  Play,
  Search,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { cn, Footer, Header } from '@stellar-starter-kit/ui';
import {
  formatAddress,
  formatBps,
  formatDuration,
  formatTokenAmount,
} from '@stellar-starter-kit/utils';
import { REPO_URL } from '../../lib/constants';

/**
 * Internal component gallery (`/ui`).
 *
 * Renders every UI primitive the dashboard uses — in all variants and states —
 * on one page so design review and screenshot diffing do not require wiring
 * components into a real flow. This page is intentionally not linked from the
 * site header; it is reachable by URL only (see issue #131).
 */

// ---------------------------------------------------------------------------
// Primitive recipes, copied verbatim from the dashboard pages they came from.
// If a class recipe changes in `streams`/`escrow`, change it here too.
// ---------------------------------------------------------------------------

const buttonBase =
  'inline-flex items-center justify-center gap-2 font-semibold transition disabled:pointer-events-none disabled:opacity-40';

const buttonVariants = {
  primary:
    'rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white shadow-lg hover:brightness-110',
  secondary: 'rounded-xl bg-purple-600 text-white hover:bg-purple-500',
  outline:
    'rounded-lg border border-slate-800 bg-slate-900/50 text-slate-300 hover:bg-slate-900 hover:text-white',
  ghost: 'rounded-lg text-slate-400 hover:text-white',
  danger: 'rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20',
} as const;

const buttonSizes = {
  xs: 'px-4 py-2 text-xs',
  sm: 'px-5 py-2.5 text-sm',
  md: 'px-6 py-3 text-sm',
} as const;

const inputClassName =
  'w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 focus:border-purple-500 focus:outline-none';

const badgeVariants = {
  cyan: 'border-cyan-500/20 bg-cyan-500/5 text-cyan-300',
  purple: 'border-purple-500/20 bg-purple-500/5 text-purple-300',
  emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300',
  amber: 'border-amber-500/20 bg-amber-500/5 text-amber-300',
  rose: 'border-rose-500/20 bg-rose-500/5 text-rose-300',
  slate: 'border-slate-800 bg-slate-900/50 text-slate-300',
} as const;

type BadgeVariant = keyof typeof badgeVariants;

function Badge({
  variant = 'cyan',
  children,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide',
        badgeVariants[variant],
      )}
    >
      {children}
    </span>
  );
}

function GallerySection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-900 bg-slate-950/40 p-6">
      <h2 className="text-sm font-semibold tracking-wider text-slate-400 uppercase">{title}</h2>
      <p className="mt-1 text-xs font-light text-slate-500">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <span className="w-40 shrink-0 text-xs font-semibold tracking-wider text-slate-500 uppercase">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

export default function UiGallery() {
  const [loading, setLoading] = useState(false);
  const [toggled, setToggled] = useState(false);

  return (
    <div className="min-h-screen bg-[#06060c] text-slate-100 selection:bg-purple-500/30 selection:text-purple-200">
      <Header />

      <main className="relative z-10 mx-auto max-w-5xl px-6 py-16">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="amber">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Internal
          </Badge>
          <Badge variant="slate">Not linked from the site navigation</Badge>
        </div>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Component gallery
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed font-light text-slate-400">
          Every dashboard primitive in every variant and state, on one page, for design review and
          screenshot diffing. Reach it at <code className="font-mono text-cyan-300">/ui</code>; it
          is deliberately absent from the header. The shared{' '}
          <code className="font-mono text-cyan-300">cn</code> helper comes from{' '}
          <code className="font-mono text-cyan-300">@stellar-starter-kit/ui</code>.
        </p>

        <div className="mt-10 space-y-6">
          {/* -------------------------------------------------- Buttons */}
          <GallerySection
            title="Buttons"
            description="Primary gradient, solid, outline, ghost, and danger variants with size, icon, loading, and disabled states."
          >
            <Row label="Variants">
              <button
                type="button"
                className={cn(buttonBase, buttonVariants.primary, buttonSizes.md)}
              >
                <Play className="h-4 w-4" /> Primary
              </button>
              <button
                type="button"
                className={cn(buttonBase, buttonVariants.secondary, buttonSizes.sm)}
              >
                <Search className="h-4 w-4" /> Secondary
              </button>
              <button
                type="button"
                className={cn(buttonBase, buttonVariants.outline, buttonSizes.sm)}
              >
                <Wallet className="h-3.5 w-3.5" /> Outline
              </button>
              <button
                type="button"
                className={cn(buttonBase, buttonVariants.ghost, buttonSizes.sm)}
              >
                Ghost
              </button>
              <button
                type="button"
                className={cn(buttonBase, buttonVariants.danger, buttonSizes.sm)}
              >
                Danger
              </button>
            </Row>
            <div className="border-t border-slate-900" />
            <Row label="Sizes">
              <button
                type="button"
                className={cn(buttonBase, buttonVariants.primary, buttonSizes.xs)}
              >
                Extra small
              </button>
              <button
                type="button"
                className={cn(buttonBase, buttonVariants.primary, buttonSizes.sm)}
              >
                Small
              </button>
              <button
                type="button"
                className={cn(buttonBase, buttonVariants.primary, buttonSizes.md)}
              >
                Medium
              </button>
            </Row>
            <div className="border-t border-slate-900" />
            <Row label="States">
              <button
                type="button"
                disabled
                className={cn(buttonBase, buttonVariants.primary, buttonSizes.md)}
              >
                Disabled
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setLoading(true);
                  window.setTimeout(() => setLoading(false), 1500);
                }}
                className={cn(buttonBase, buttonVariants.primary, buttonSizes.md)}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {loading ? 'Submitting…' : 'Click for loading state'}
              </button>
              <button
                type="button"
                aria-pressed={toggled}
                onClick={() => setToggled((value) => !value)}
                className={cn(
                  buttonBase,
                  buttonVariants.outline,
                  buttonSizes.sm,
                  toggled && 'border-cyan-500/40 text-cyan-300',
                )}
              >
                {toggled ? 'Toggled on' : 'Toggled off'}
              </button>
            </Row>
          </GallerySection>

          {/* -------------------------------------------------- Form controls */}
          <GallerySection
            title="Form controls"
            description="Text and number inputs in default, focus, disabled, and error states, plus textarea and select."
          >
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Default input
                </span>
                <input className={cn(inputClassName, 'mt-2')} placeholder="G..." defaultValue="" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Number input
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  defaultValue="100"
                  className={cn(inputClassName, 'mt-2')}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Disabled input
                </span>
                <input
                  disabled
                  defaultValue="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
                  className={cn(inputClassName, 'mt-2 cursor-not-allowed opacity-40')}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Error input
                </span>
                <input
                  defaultValue="not-a-contract-id"
                  aria-invalid
                  className={cn(inputClassName, 'mt-2 border-rose-500/50 focus:border-rose-500')}
                />
                <span className="mt-1.5 block text-xs text-rose-400">
                  Must be a C... contract id.
                </span>
              </label>
              <label className="block">
                <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Select
                </span>
                <select className={cn(inputClassName, 'mt-2')} defaultValue="testnet">
                  <option value="local">Local</option>
                  <option value="testnet">Testnet</option>
                  <option value="mainnet">Mainnet</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Textarea
                </span>
                <textarea
                  rows={3}
                  placeholder="Label (optional)"
                  className={cn(inputClassName, 'mt-2 resize-y font-sans')}
                />
              </label>
            </div>
          </GallerySection>

          {/* -------------------------------------------------- Badges */}
          <GallerySection
            title="Badges & status chips"
            description="Pill variants used for protocol tags and stream/escrow statuses."
          >
            <Row label="Variants">
              {(Object.keys(badgeVariants) as BadgeVariant[]).map((variant) => (
                <Badge key={variant} variant={variant}>
                  {variant}
                </Badge>
              ))}
            </Row>
            <div className="border-t border-slate-900" />
            <Row label="With icon">
              <Badge variant="cyan">
                <Droplets className="h-3.5 w-3.5" /> Stellar Streams Protocol
              </Badge>
              <Badge variant="emerald">Active</Badge>
              <Badge variant="amber">Cancelling</Badge>
              <Badge variant="rose">Cancelled</Badge>
              <Badge variant="slate">Ended</Badge>
            </Row>
            <div className="border-t border-slate-900" />
            <Row label="Status dots">
              <span className="flex items-center gap-2 text-sm text-slate-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Connected
              </span>
              <span className="flex items-center gap-2 text-sm text-slate-400">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> Wallet not connected
              </span>
            </Row>
          </GallerySection>

          {/* -------------------------------------------------- Alerts */}
          <GallerySection
            title="Alerts"
            description="Inline notification banners shown above the dashboard forms."
          >
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="font-light">Stream created successfully. Tx abc123…</p>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="font-light">No stream found with id 42.</p>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="font-light">Set NEXT_PUBLIC_STREAM_CONTRACT_ID before creating.</p>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-300">
                <Info className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="font-light">
                  Amounts are in the token&apos;s smallest unit (stroops).
                </p>
              </div>
            </div>
          </GallerySection>

          {/* -------------------------------------------------- Surfaces */}
          <GallerySection
            title="Cards & surfaces"
            description="Panel, glass, and hover-lift containers used across the dashboard."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-6">
                <h3 className="text-sm font-bold text-white">Panel card</h3>
                <p className="mt-2 text-sm leading-relaxed font-light text-slate-400">
                  Default container: <code className="font-mono">border-slate-900</code> on{' '}
                  <code className="font-mono">bg-slate-950/40</code>.
                </p>
              </div>
              <div className="glass rounded-2xl p-6">
                <h3 className="text-sm font-bold text-white">Glass card</h3>
                <p className="mt-2 text-sm leading-relaxed font-light text-slate-400">
                  Uses the <code className="font-mono">.glass</code> helper from globals.css.
                </p>
              </div>
              <div className="glass glass-hover cursor-pointer rounded-2xl p-6">
                <h3 className="text-sm font-bold text-white">Hover-lift card</h3>
                <p className="mt-2 text-sm leading-relaxed font-light text-slate-400">
                  <code className="font-mono">.glass-hover</code> — focus me with the mouse.
                </p>
              </div>
            </div>
          </GallerySection>

          {/* -------------------------------------------------- Typography */}
          <GallerySection
            title="Typography"
            description="Heading, label, body, and code styles used in pages and docs."
          >
            <div className="space-y-4">
              <h1 className="text-3xl font-extrabold tracking-tight text-white">Heading 1</h1>
              <h2 className="text-2xl font-extrabold text-white">Heading 2</h2>
              <h3 className="text-sm font-bold text-white">Card title</h3>
              <span className="block text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Field label
              </span>
              <p className="max-w-2xl text-sm leading-relaxed font-light text-slate-400">
                Body copy is small, light, and slate-toned so dense financial UIs stay readable.
              </p>
              <pre className="overflow-x-auto rounded-xl border border-slate-900 bg-[#08080f] p-4 font-mono text-xs leading-relaxed text-slate-300">
                {`import { StreamsClient } from '@stellar-starter-kit/sdk';`}
              </pre>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-cyan-400 transition-colors hover:text-cyan-300"
              >
                External link <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </GallerySection>

          {/* -------------------------------------------------- Formatted data */}
          <GallerySection
            title="Formatted data"
            description="Live output of the @stellar-starter-kit/utils helpers the dashboard renders."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(
                [
                  [
                    'formatAddress(GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ, 6)',
                    formatAddress('GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ', 6),
                  ],
                  ['formatTokenAmount(1_234_567n, 6)', formatTokenAmount(1_234_567n, 6)],
                  ['formatTokenAmount(123_456_789n, 7)', formatTokenAmount(123_456_789n, 7)],
                  [
                    'formatDuration(2 * 86_400 + 3 * 3_600 + 240)',
                    formatDuration(2 * 86_400 + 3 * 3_600 + 240),
                  ],
                  ['formatBps(2550)', formatBps(2550)],
                  ['formatBps(10_000)', formatBps(10_000)],
                ] as [string, string][]
              ).map(([expression, result]) => (
                <div
                  key={expression}
                  className="flex items-center justify-between gap-4 rounded-xl border border-slate-900 bg-slate-950/40 px-4 py-3"
                >
                  <code className="truncate font-mono text-xs text-slate-500">{expression}</code>
                  <span className="shrink-0 font-mono text-sm font-semibold text-cyan-300">
                    {result}
                  </span>
                </div>
              ))}
            </div>
          </GallerySection>
        </div>
      </main>

      <Footer />
    </div>
  );
}
