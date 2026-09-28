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
  async rewrites() {
    return [{ source: "/backend/:path*", destination: `${proxyTarget}/:path*` }];
  },
};

export default nextConfig;
