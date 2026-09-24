import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
  async rewrites() {
    return [{ source: "/backend/:path*", destination: "http://127.0.0.1:43123/:path*" }];
  },
};

export default nextConfig;
