import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // /api-proxy/* ditangani route handler src/app/api-proxy/[...path]/route.ts
  // (verifikasi sesi + header X-Internal-Token). Sengaja TIDAK memakai rewrite:
  // rewrite meneruskan request tanpa autentikasi ke backend.

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
