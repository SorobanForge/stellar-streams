'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Github, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import Logo from './Logo';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isMenuOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsMenuOpen(false);
          menuButtonRef.current?.focus();
        }
      };
      const handleClickOutside = (e: MouseEvent) => {
        if (
          e.target instanceof Node &&
          menuButtonRef.current &&
          !menuButtonRef.current.contains(e.target) &&
          !panelRef.current?.contains(e.target)
        ) {
          setIsMenuOpen(false);
          menuButtonRef.current?.focus();
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [isMenuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-900/80 bg-[#07070e]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 text-white">
            <Logo size={18} />
          </div>
          <span className="font-extrabold tracking-wider text-white">Stellar Streams</span>
        </Link>

        {/* Mobile menu button */}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-controls="mobile-menu"
          aria-expanded={isMenuOpen}
          className="flex items-center gap-2 rounded-lg p-2 text-slate-300 hover:bg-slate-900/50 hover:text-white md:hidden"
        >
          <span className="sr-only">{isMenuOpen ? 'Close main menu' : 'Open main menu'}</span>
          {/* Hamburger icon */}
          {isMenuOpen ? (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          )}
        </button>

        {/* Desktop navigation */}
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
            href="https://github.com/SorobanForge/stellar-streams"
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

      {/* Mobile menu panel */}
      {isMenuOpen && (
        <div
          ref={panelRef}
          id="mobile-menu"
          className="fixed inset-x-0 top-16 z-40 flex items-center justify-center bg-[#07070e]/90 px-4 pb-6 backdrop-blur-md"
          role="menu"
          aria-orientation="vertical"
          aria-label="Mobile menu"
        >
          <div className="w-full max-w-xs space-y-2">
            <a
              href="/#protocol"
              className="block rounded-md px-3 py-2 text-base font-medium text-slate-300 hover:bg-slate-900/50 hover:text-white"
              onClick={() => setIsMenuOpen(false)}
            >
              Protocol
            </a>
            <a
              href="/#sdk"
              className="block rounded-md px-3 py-2 text-base font-medium text-slate-300 hover:bg-slate-900/50 hover:text-white"
              onClick={() => setIsMenuOpen(false)}
            >
              SDK
            </a>
            <a
              href="/#roadmap"
              className="block rounded-md px-3 py-2 text-base font-medium text-slate-300 hover:bg-slate-900/50 hover:text-white"
              onClick={() => setIsMenuOpen(false)}
            >
              Roadmap
            </a>
            <Link
              href="/docs"
              className="flex items-center gap-1 rounded-md px-3 py-2 text-base font-medium text-slate-300 hover:bg-slate-900/50 hover:text-white"
              onClick={() => setIsMenuOpen(false)}
            >
              Docs <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/streams"
              className="block rounded-md px-3 py-2 text-base font-semibold text-cyan-400 hover:text-cyan-300"
              onClick={() => setIsMenuOpen(false)}
            >
              Streams App
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
