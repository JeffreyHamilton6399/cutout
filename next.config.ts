import type { NextConfig } from "next";

/**
 * Cross-origin isolation headers.
 *
 * Setting `Cross-Origin-Opener-Policy: same-origin` and
 * `Cross-Origin-Embedder-Policy: credentialless` makes the page "cross-origin
 * isolated". That unlocks `SharedArrayBuffer` and multi-threaded WebAssembly
 * for the in-browser background-removal model — a meaningful speedup on
 * multi-core devices (the @imgly WASM model otherwise falls back to a single
 * thread).
 *
 * Why `credentialless` instead of `require-corp`:
 * `require-corp` blocks any cross-origin resource that doesn't send a
 * `Cross-Origin-Resource-Policy` header, which broke the @imgly model CDN
 * fetch (the ONNX runtime's internal fetches don't always handle COEP).
 * `credentialless` still enables cross-origin isolation but loads
 * cross-origin resources without credentials instead of blocking them —
 * the model downloads cleanly and multi-threaded WASM still works.
 *
 * Vercel serves these headers as-is.
 */
const crossOriginIsolationHeaders = [
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Embedder-Policy",
    value: "credentialless",
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
