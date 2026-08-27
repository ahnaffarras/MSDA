import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  output: "standalone",

  env: {
    NEXT_PUBLIC_API_URL:  BACKEND_URL,
    NEXT_PUBLIC_WS_URL:   process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080",
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
  },

  // Proxy /api-proxy/* → Go backend (solves browser CORS)
  async rewrites() {
    return [
      {
        source:      "/api-proxy/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options",       value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",     value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
