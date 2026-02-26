// apps/web/next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Server-side proxy target (Next server -> API)
    // Default to local API if not provided.
    const api = (process.env.ZENSQUID_API_URL || "http://127.0.0.1:18790").replace(/\/+$/, "");

    return [
      {
        source: "/api/zsq/:path*",
        destination: `${api}/:path*`
      }
    ];
  }
};

export default nextConfig;