import type { NextConfig } from "next";

// Keep the complete archive outside serverless output. A bounded, hash-verified
// serving projection supports national lookup in the website's Node functions.
const registryFiles = ["./data/govroute-runtime.db.gz", "./data/registry/runtime-release.json", ...(process.env.GOVROUTE_BUNDLE_REGISTRY === "true" ? ["./data/govroute-locations.db"] : [])];
const nextConfig: NextConfig = {
  // Vercel's Next.js adapter handles deployment output itself. Keeping
  // standalone enabled there triggers a Next.js 16.3 build-finalization bug.
  output: process.env.VERCEL ? undefined : "standalone",
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: {
    "/api/chat": ["./database/migrations/**/*", "./data/govguide.db", ...registryFiles],
    "/api/places": registryFiles,
    "/api/local-resources": registryFiles,
    "/api/processes": registryFiles,
    "/api/location/resolve": registryFiles,
    "/api/catalog": ["./data/govguide.db"],
    "/graph": ["./data/govguide.db"],
    "/data": registryFiles
  },
  outputFileTracingExcludes: process.env.GOVROUTE_BUNDLE_REGISTRY === "true"
    ? { "/**": ["./data/govroute-runtime.db", "./data/govroute-locations.db.gz"] } : { "/**": ["./data/govroute-locations.db", "./data/govroute-locations.db.gz", "./data/govroute-runtime.db"] },
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["cheerio"]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" }
        ]
      }
    ];
  }
};

export default nextConfig;
