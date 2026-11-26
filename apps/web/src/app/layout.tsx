import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@stellar-starter-kit/ui';
import { WalletProvider } from '@stellar-starter-kit/wallets';
import { ThemeProvider } from '../components/theme/ThemeProvider';
import { THEME_INIT_SCRIPT } from '../lib/theme';

export const metadata: Metadata = {
  title: 'Stellar Streams',
  description:
    'Open-source payment streaming, vesting, and splits protocol for Stellar and Soroban.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The inline script sets `class` and `data-theme` on <html> before React
    // hydrates, so the server markup cannot match that attribute — the
    // mismatch is intentional and suppressed here.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Must run before first paint to avoid a flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <WalletProvider>
            <ToastProvider>{children}</ToastProvider>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
