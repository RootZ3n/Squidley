/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/zsq/:path*",
        destination: "http://100.78.201.54:18790/:path*",
      },
    ];
  },
};

export default nextConfig;