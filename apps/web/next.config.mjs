/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@stellar-starter-kit/ui',
    '@stellar-starter-kit/wallets',
    '@stellar-starter-kit/contracts',
    '@stellar-starter-kit/sdk',
    '@stellar-starter-kit/hooks',
    '@stellar-starter-kit/types',
    '@stellar-starter-kit/utils',
  ],
};

export default nextConfig;
