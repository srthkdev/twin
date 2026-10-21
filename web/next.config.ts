import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // A stray ~/package-lock.json made Next pick the home dir as workspace root.
  turbopack: { root: path.resolve(__dirname) },
  serverExternalPackages: ["@json-render/react-pdf", "@react-pdf/renderer"],
  // The agent and city routes read the precomputed data from disk; ship it with those serverless functions.
  outputFileTracingIncludes: {
    "/api/agent": ["./public/data/**/*", "./lib/agent/data/**/*", "./lib/agent/skills/*.md"],
    "/api/cities": ["./public/data/**/*", "./lib/agent/data/**/*"],
    "/api/cities/[id]/core": ["./public/data/**/*", "./lib/agent/data/**/*"],
    "/blog": ["./content/**/*"],
  },
};

export default nextConfig;
