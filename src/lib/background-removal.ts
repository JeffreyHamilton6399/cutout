"use client";

import type { ProgressInfo } from "@/types/cutout";

/**
 * Lazy wrapper around `@imgly/background-removal`.
 *
 * The library bundles a WASM model fetched from a CDN on first use and cached
 * by the browser afterwards. We dynamic-import the library so it is never
 * pulled into the initial JS bundle — it only loads the moment a user
 * actually drops an image.
 *
 * Everything runs client-side: the photo is decoded in-browser, the AI model
 * runs as WASM, and the transparent PNG is produced locally. No network
 * request is ever made with the user's image bytes.
 *
 * Performance / quality choices:
 *  - model: "isnet_fp16" — best quality/size balance (~44MB, fp16). The full
 *    "isnet" (fp32, ~176MB) gives only marginal quality gains at 4× the
 *    download, unacceptable on mobile. "isnet_quint8" (~11MB) is faster but
 *    noticeably lower quality on hair/fur edges.
 *  - proxyToWorker: true — runs inference in a Web Worker so the main thread
 *    (UI) never freezes. This is the single biggest UX win.
 *  - device: "cpu" — the library's "gpu" path targets WebGPU which is still
 *    experimental and unreliable across browsers; CPU WASM is consistent.
 *  - output: image/png — lossless, preserves alpha for transparency.
 *  - Multi-threaded WASM is enabled automatically when the page is
 *    cross-origin isolated (see COOP/COEP headers in next.config.ts).
 */

type RemoveBgOptions = {
  /** Called with normalized progress updates (0..1) and a stage label. */
  onProgress?: (info: ProgressInfo) => void;
  /** Optional abort signal. */
  signal?: AbortSignal;
};

let modulePromise: Promise<typeof import("@imgly/background-removal")> | null =
  null;

function loadModule() {
  if (!modulePromise) {
    modulePromise = import("@imgly/background-removal");
  }
  return modulePromise;
}

/**
 * Mapping from the library's progress keys to user-friendly stage labels.
 * The library emits keys like `fetch:/path/to/model.onnx` while downloading
 * the model and `compute:inference` while running inference.
 */
function describeKey(key: string): {
  label: string;
  stage: "model" | "inference";
} {
  const k = key.toLowerCase();
  if (
    k.startsWith("fetch") ||
    k.startsWith("download") ||
    k.startsWith("init")
  ) {
    return {
      label: "Loading AI model (one-time 44MB download)",
      stage: "model",
    };
  }
  if (k.startsWith("compute") || k.startsWith("inference")) {
    return { label: "Removing background…", stage: "inference" };
  }
  return { label: "Processing…", stage: "inference" };
}

/**
 * Remove the background from a File/Blob and return a transparent PNG Blob.
 */
export async function removeImageBackground(
  input: Blob | File,
  options: RemoveBgOptions = {},
): Promise<Blob> {
  const { onProgress, signal } = options;
  const mod = await loadModule();
  const removeBackground = mod.removeBackground;

  const blob = await removeBackground(input, {
    signal,
    // Best quality/size model. See file header for rationale.
    model: "isnet_fp16",
    // Run inference in a Web Worker so the UI thread never blocks.
    proxyToWorker: true,
    // CPU WASM is the consistent, well-supported path.
    device: "cpu",
    // Lossless transparent PNG output.
    output: { format: "image/png", quality: 0.8 },
    progress: (key: string, current: number, total: number) => {
      const { label, stage } = describeKey(key);
      const ratio = total > 0 ? Math.min(1, current / total) : 0;
      onProgress?.({ ratio, label, stage });
    },
  });

  return blob;
}

/**
 * Pre-warm the model (download + instantiate) without processing an image.
 * Called on idle after terms acceptance so the first real removal is fast.
 */
export async function preloadBackgroundRemovalModel(
  onProgress?: (info: ProgressInfo) => void,
): Promise<void> {
  try {
    const mod = await loadModule();
    if (typeof mod.preload === "function") {
      await mod.preload({
        model: "isnet_fp16",
        device: "cpu",
        progress: (key: string, current: number, total: number) => {
          const { label } = describeKey(key);
          const ratio = total > 0 ? Math.min(1, current / total) : 0;
          onProgress?.({ ratio, label });
        },
      });
    }
  } catch {
    // Preload is best-effort; ignore failures — the real call will retry.
  }
}
