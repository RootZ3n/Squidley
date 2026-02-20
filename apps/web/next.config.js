// apps/web/next.config.js

/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: these should be hostnames/origins (no "http://")
  // Works for dev-origin checks Next warns about.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.88.10"]
};

module.exports = nextConfig;
