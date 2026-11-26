'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Github, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Logo } from './Logo';
import { REPO_URL } from '../constants';

export interface HeaderProps {
  /**
   * Extra controls rendered before the repository link, e.g. the dashboard's
   * theme toggle. Kept as a slot so this package does not depend on the app's
   * theme provider.
   */
  actions?: React.ReactNode;
}

export function Header({ actions }: HeaderProps = {}) {
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
    <header className="border-border bg-background/80 sticky top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 text-white">
            <Logo size={18} />
          </div>
          <span className="text-foreground font-extrabold tracking-wider">Stellar Streams</span>
        </Link>

        {/* Mobile menu button */}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-controls="mobile-menu"
          aria-expanded={isMenuOpen}
          className="text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center gap-2 rounded-lg p-2 md:hidden"
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
        <nav className="text-muted-foreground hidden items-center gap-8 text-sm font-medium md:flex">
          <a href="/#protocol" className="hover:text-foreground transition-colors">
            Protocol
          </a>
          <a href="/#sdk" className="hover:text-foreground transition-colors">
            SDK
          </a>
          <a href="/#roadmap" className="hover:text-foreground transition-colors">
            Roadmap
          </a>
          <Link
            href="/docs"
            className="hover:text-foreground flex items-center gap-1 transition-colors"
          >
            Docs <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/streams"
            className="font-semibold text-cyan-700 transition-colors hover:text-cyan-600 dark:text-cyan-400 dark:hover:text-cyan-300"
          >
            Streams App
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          {actions}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground flex h-9 w-9 items-center justify-center rounded-lg border transition-colors"
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
          className="bg-background/95 fixed inset-x-0 top-16 z-40 flex items-center justify-center px-4 pb-6 backdrop-blur-md"
          role="menu"
          aria-orientation="vertical"
          aria-label="Mobile menu"
        >
          <div className="w-full max-w-xs space-y-2">
            <a
              href="/#protocol"
              className="text-muted-foreground hover:bg-secondary hover:text-foreground block rounded-md px-3 py-2 text-base font-medium"
              onClick={() => setIsMenuOpen(false)}
            >
              Protocol
            </a>
            <a
              href="/#sdk"
              className="text-muted-foreground hover:bg-secondary hover:text-foreground block rounded-md px-3 py-2 text-base font-medium"
              onClick={() => setIsMenuOpen(false)}
            >
              SDK
            </a>
            <a
              href="/#roadmap"
              className="text-muted-foreground hover:bg-secondary hover:text-foreground block rounded-md px-3 py-2 text-base font-medium"
              onClick={() => setIsMenuOpen(false)}
            >
              Roadmap
            </a>
            <Link
              href="/docs"
              className="text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center gap-1 rounded-md px-3 py-2 text-base font-medium"
              onClick={() => setIsMenuOpen(false)}
            >
              Docs <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/streams"
              className="block rounded-md px-3 py-2 text-base font-semibold text-cyan-700 hover:text-cyan-600 dark:text-cyan-400 dark:hover:text-cyan-300"
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

export default Header;
