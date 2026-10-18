import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@stellar-starter-kit/ui';
import { WalletProvider } from '@stellar-starter-kit/wallets';

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
    <html lang="en">
      <body className="antialiased">
        <WalletProvider>
          <ToastProvider>{children}</ToastProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
