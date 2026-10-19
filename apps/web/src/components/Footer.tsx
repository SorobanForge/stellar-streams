'use client';

import React from 'react';
import { Star, Github } from 'lucide-react';
import { CONTRACT_VERSION } from '@stellar-starter-kit/contracts';
import Logo from './Logo';
import { REPO_URL } from '../lib/constants';

const REPO = REPO_URL;
const NETWORK_LABEL = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet').toUpperCase();

export default function Footer() {
  return (
    <footer
      className="relative z-10 border-t border-slate-900 bg-[#04040a] py-16"
      aria-label="Footer"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 text-white">
                <Logo size={16} />
              </div>
              <span className="font-extrabold tracking-wider text-white">Stellar Streams</span>
            </div>
            <p className="max-w-sm text-sm leading-relaxed font-light text-slate-400">
              Open-source protocol for continuous payment streams, vesting schedules, and payment
              splits on Stellar and Soroban.
            </p>
            <div className="mt-6 flex items-center gap-4 text-slate-500">
              <a
                href={REPO}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-white"
                aria-label="GitHub Repository"
              >
                <Github className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h5 className="mb-4 text-xs font-bold tracking-wide text-slate-500 uppercase">
              Resources
            </h5>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <a
                  href="https://stellar.org"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-white"
                >
                  Stellar Foundation
                </a>
              </li>
              <li>
                <a
                  href="https://soroban.stellar.org"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-white"
                >
                  Soroban Docs
                </a>
              </li>
              <li>
                <a href="/docs" className="transition-colors hover:text-white">
                  Documentation
                </a>
              </li>
              <li>
                <a href="/streams" className="transition-colors hover:text-white">
                  Streams App
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="mb-4 text-xs font-bold tracking-wide text-slate-500 uppercase">
              Developers
            </h5>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <a
                  href={`${REPO}/blob/main/CONTRIBUTING.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  Contributing
                </a>
              </li>
              <li>
                <a
                  href={`${REPO}/blob/main/SECURITY.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  Security Policy
                </a>
              </li>
              <li>
                <a
                  href={`${REPO}/blob/main/LICENSE`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  MIT License
                </a>
              </li>
              <li>
                <a href="/#roadmap" className="transition-colors hover:text-white">
                  Roadmap
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-900 pt-8 text-xs text-slate-500 md:flex-row">
          <div>&copy; {new Date().getFullYear()} Stellar Streams. MIT licensed.</div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-slate-800 px-2 py-0.5 font-mono text-[11px]">
              {NETWORK_LABEL} · contract v{CONTRACT_VERSION}
            </span>
            <span>Maintained by SorobanForge and the community</span>
            <Star className="h-3 w-3 fill-yellow-500/20 text-yellow-500/80" />
          </div>
        </div>
      </div>
    </footer>
  );
}
