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
  // Enable crossOriginIsolated for SharedArrayBuffer — required by
  // @imgly/background-removal (ONNX WASM multi-threaded inference).
  // Safe for this single-operator admin tool; would need review if
  // loading third-party scripts from other origins.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
