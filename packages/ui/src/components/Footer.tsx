'use client';

import * as React from 'react';
import { Star, Github } from 'lucide-react';
import { CONTRACT_VERSION } from '@stellar-starter-kit/contracts';
import { Logo } from './Logo';
import { REPO_URL } from '../constants';

const NETWORK_LABEL = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet').toUpperCase();

export function Footer() {
  return (
    <footer
      className="border-border bg-background relative z-10 border-t py-16"
      aria-label="Footer"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 text-white">
                <Logo size={16} />
              </div>
              <span className="text-foreground font-extrabold tracking-wider">Stellar Streams</span>
            </div>
            <p className="text-muted-foreground max-w-sm text-sm leading-relaxed font-light">
              Open-source protocol for continuous payment streams, vesting schedules, and payment
              splits on Stellar and Soroban.
            </p>
            <div className="text-muted-foreground mt-6 flex items-center gap-4">
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground transition-colors"
                aria-label="GitHub Repository"
              >
                <Github className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h5 className="text-muted-foreground mb-4 text-xs font-bold tracking-wide uppercase">
              Resources
            </h5>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li>
                <a
                  href="https://stellar.org"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  Stellar Foundation
                </a>
              </li>
              <li>
                <a
                  href="https://soroban.stellar.org"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  Soroban Docs
                </a>
              </li>
              <li>
                <a href="/docs" className="hover:text-foreground transition-colors">
                  Documentation
                </a>
              </li>
              <li>
                <a href="/streams" className="hover:text-foreground transition-colors">
                  Streams App
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="text-muted-foreground mb-4 text-xs font-bold tracking-wide uppercase">
              Developers
            </h5>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li>
                <a
                  href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  Contributing
                </a>
              </li>
              <li>
                <a
                  href={`${REPO_URL}/blob/main/SECURITY.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  Security Policy
                </a>
              </li>
              <li>
                <a
                  href={`${REPO_URL}/blob/main/LICENSE`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  MIT License
                </a>
              </li>
              <li>
                <a href="/#roadmap" className="hover:text-foreground transition-colors">
                  Roadmap
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-border text-muted-foreground flex flex-col items-center justify-between gap-4 border-t pt-8 text-xs md:flex-row">
          <div>&copy; {new Date().getFullYear()} Stellar Streams. MIT licensed.</div>
          <div className="flex items-center gap-2">
            <span className="border-border rounded border px-2 py-0.5 font-mono text-[11px]">
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

export default Footer;
