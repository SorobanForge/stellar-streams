'use client';

import React from 'react';
import { Header } from '@stellar-starter-kit/ui';
import { ThemeToggle } from './theme/ThemeToggle';

/**
 * The shared header plus the dashboard's theme toggle. The UI package cannot
 * reach the app's theme provider, so the header exposes an `actions` slot and
 * the app fills it here.
 */
export function AppHeader() {
  return <Header actions={<ThemeToggle />} />;
}

export default AppHeader;
