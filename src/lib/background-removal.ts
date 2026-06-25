"use client";

import type { ProgressInfo } from "@/types/cutout";

/**
 * Lazy wrapper around `@imgly/background-removal`.
 *
 * The library bundles a ~40MB WASM model that is fetched from a CDN on first
 * use and then cached by the browser. We dynamic-import the library so it is
 * never pulled into the initial JS bundle — it only loads the moment a user
 * actually drops an image.
 *
 * Everything runs client-side: the photo is decoded in-browser, the AI model
 * runs as WASM, and the transparent PNG is produced locally. No network
 * request is ever made with the user's image bytes.
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
function describeKey(key: string): { label: string; stage: "model" | "inference" } {
  if (key.startsWith("fetch") || key.startsWith("download")) {
    return { label: "Loading AI model (one-time 40MB download)", stage: "model" };
  }
  if (key.startsWith("compute") || key.startsWith("inference")) {
    return { label: "Removing background…", stage: "inference" };
  }
  if (key.startsWith("init")) {
    return { label: "Initializing AI model…", stage: "model" };
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

  // Heuristic overall weighting: model download is the bulk of first-run
  // time, inference is the bulk of steady-state time. We just normalize each
  // segment to 0..1 and let the label communicate the stage.
  const blob = await removeBackground(input, {
    signal,
    progress: (key: string, current: number, total: number) => {
      const { label } = describeKey(key);
      const ratio = total > 0 ? Math.min(1, current / total) : 0;
      onProgress?.({ ratio, label });
    },
  });

  return blob;
}

/**
 * Pre-warm the model (download + instantiate) without processing an image.
 * Useful to trigger the one-time download the moment a user accepts terms,
 * so the first real removal is fast.
 */
export async function preloadBackgroundRemovalModel(
  onProgress?: (info: ProgressInfo) => void,
): Promise<void> {
  try {
    const mod = await loadModule();
    // The library exposes `preload` which downloads assets without inference.
    if (typeof (mod as unknown as { preload?: unknown }).preload === "function") {
      await (mod as unknown as { preload: (opts?: unknown) => Promise<void> }).preload({
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
