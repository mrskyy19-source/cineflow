/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      { source: "/uploads/:path*", destination: "/api/media/uploads/:path*" },
      { source: "/processed/:path*", destination: "/api/media/processed/:path*" },
    ];
  },
};

module.exports = nextConfig;
