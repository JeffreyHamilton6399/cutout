import type { NextConfig } from "next";

/**
 * Cross-origin isolation headers.
 *
 * Setting `Cross-Origin-Opener-Policy: same-origin` and
 * `Cross-Origin-Embedder-Policy: require-corp` makes the page "cross-origin
 * isolated". That unlocks `SharedArrayBuffer` and multi-threaded WebAssembly
 * for the in-browser background-removal model — a meaningful speedup on
 * multi-core devices (the @imgly WASM model otherwise falls back to a single
 * thread and prints a console warning).
 *
 * Trade-off: the page can no longer load cross-origin resources without them
 * sending CORS headers. The only cross-origin resource Cutout loads is the
 * AI model from staticimgly.com, which is served with `Access-Control-Allow-Origin: *`,
 * so COEP is satisfied. Vercel serves these headers as-is.
 */
const crossOriginIsolationHeaders = [
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Embedder-Policy",
    value: "require-corp",
  },
];

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: crossOriginIsolationHeaders,
      },
    ];
  },
};

export default nextConfig;
