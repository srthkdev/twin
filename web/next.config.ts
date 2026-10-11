import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // A stray ~/package-lock.json made Next pick the home dir as workspace root.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
