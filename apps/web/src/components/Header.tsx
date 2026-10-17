'use client';

import React from 'react';
import { Github, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import Logo from './Logo';
import { REPO_URL } from '../lib/constants';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-900/80 bg-[#07070e]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 text-white">
            <Logo size={18} />
          </div>
          <span className="font-extrabold tracking-wider text-white">Stellar Streams</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-300 md:flex">
          <a href="/#protocol" className="transition-colors hover:text-white">
            Protocol
          </a>
          <a href="/#sdk" className="transition-colors hover:text-white">
            SDK
          </a>
          <a href="/#roadmap" className="transition-colors hover:text-white">
            Roadmap
          </a>
          <Link href="/docs" className="flex items-center gap-1 transition-colors hover:text-white">
            Docs <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/streams"
            className="font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
          >
            Streams App
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/50 text-slate-300 transition-colors hover:bg-slate-900 hover:text-white"
            aria-label="GitHub Repository"
          >
            <Github className="h-5 w-5" />
          </a>
          <Link
            href="/streams"
            className="hidden h-9 items-center justify-center rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 px-4 text-xs font-semibold text-white shadow-md shadow-purple-500/10 transition-all duration-300 hover:brightness-110 sm:inline-flex"
          >
            Launch App
          </Link>
        </div>
      </div>
    </header>
  );
}
