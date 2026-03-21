import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["three"],
  turbopack: {
    root: path.resolve(__dirname),
  },
  webpack(config) {
    config.experiments = { ...(config.experiments ?? {}), asyncWebAssembly: true };
    return config;
  },
};

export default nextConfig;
