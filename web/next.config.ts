import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// `/backend/*` proxies to the API when NEXT_PUBLIC_API_URL is empty. Locally that is the
// Fastify dev server; on Vercel, API_PROXY_URL can point it at Render so the session cookie
// stays first-party (Safari blocks third-party cookies).
const proxyTarget = (process.env.API_PROXY_URL?.trim() || "http://127.0.0.1:43123").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
  // The old production address keeps working by sending people to the new domain.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "matchinvoice.vercel.app" }],
        destination: "https://evenbooks.app/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [{ source: "/backend/:path*", destination: `${proxyTarget}/:path*` }];
  },
};

export default nextConfig;
