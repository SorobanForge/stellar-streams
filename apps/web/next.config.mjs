/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ship only the lucide-react icons each module imports instead of the
  // whole barrel file.
  optimizePackageImports: ['lucide-react'],
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
