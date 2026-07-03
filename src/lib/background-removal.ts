"use client";

import type { ModelQuality, ProgressInfo } from "@/types/cutout";

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
 *  - model: selectable — "standard" (isnet_fp16, ~44MB, fast) or
 *    "maximum" (isnet fp32, ~176MB, best quality on dark subjects/hair).
 *  - proxyToWorker: true — runs inference in a Web Worker so the main thread
 *    (UI) never freezes.
 *  - device: "cpu" — the library's "gpu" path targets WebGPU which is still
 *    experimental and unreliable across browsers; CPU WASM is consistent.
 *  - output: image/png — lossless, preserves alpha for transparency.
 *  - Multi-threaded WASM is enabled automatically when the page is
 *    cross-origin isolated (see COOP/COEP headers in next.config.ts).
 *
 * Robustness:
 *  - Inference is wrapped in a timeout (default 120s). If the worker hangs
 *    (rare, but happens on OOM or a stalled model fetch), we abort and
 *    reject with a clear error so the UI can surface a Retry button instead
 *    of spinning forever.
 */

type RemoveBgOptions = {
  /** Called with normalized progress updates (0..1) and a stage label. */
  onProgress?: (info: ProgressInfo) => void;
  /** Optional abort signal. */
  signal?: AbortSignal;
  /** Which model to use. */
  quality?: ModelQuality;
  /** Hard timeout in ms. Default 120000 (2 min). */
  timeoutMs?: number;
};

/** Default hard timeout. The model + inference normally takes 5-30s; we
 * allow 2 minutes for slow devices + first-run model download combined. */
const DEFAULT_TIMEOUT_MS = 120_000;

let modulePromise: Promise<typeof import("@imgly/background-removal")> | null =
  null;

function loadModule() {
  if (!modulePromise) {
    modulePromise = import("@imgly/background-removal");
  }
  return modulePromise;
}

function modelForQuality(quality: ModelQuality): "isnet_fp16" | "isnet" {
  return quality === "maximum" ? "isnet" : "isnet_fp16";
}

/**
 * Mapping from the library's progress keys to user-friendly stage labels.
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
    const label =
      modelPromise === null
        ? "Loading AI model…"
        : "Loading AI model (one-time download)";
    return { label, stage: "model" };
  }
  if (k.startsWith("compute") || k.startsWith("inference")) {
    return { label: "Removing background…", stage: "inference" };
  }
  return { label: "Processing…", stage: "inference" };
}

/**
 * Remove the background from a File/Blob and return a transparent PNG Blob.
 *
 * Wraps the library call in a timeout race — if the worker hangs, we abort
 * via the signal and reject, so the caller can show a retry instead of
 * hanging forever.
 */
export async function removeImageBackground(
  input: Blob | File,
  options: RemoveBgOptions = {},
): Promise<Blob> {
  const {
    onProgress,
    signal,
    quality = "standard",
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const mod = await loadModule();
  const removeBackground = mod.removeBackground;

  // We need our own controller so we can fire the timeout, but we also
  // respect a caller-supplied signal.
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onCallerAbort, { once: true });
  }

  // Sliding timeout: reset whenever we receive progress. A slow first-run
  // model download (~44MB) that's actively making progress won't time out,
  // but a true hang (no progress for `timeoutMs`) will. This is the key
  // robustness fix — a fixed 120s timeout was too short for slow connections
  // downloading the model, causing false "doesn't process" failures.
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(
    () => controller.abort(new Error("TIMEOUT")),
    timeoutMs,
  );
  const resetTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(
      () => controller.abort(new Error("TIMEOUT")),
      timeoutMs,
    );
  };

  try {
    const blob = await removeBackground(input, {
      signal: controller.signal,
      model: modelForQuality(quality),
      proxyToWorker: true,
      device: "cpu",
      output: { format: "image/png", quality: 0.8 },
      progress: (key: string, current: number, total: number) => {
        resetTimer();
        const { label, stage } = describeKey(key);
        const ratio = total > 0 ? Math.min(1, current / total) : 0;
        onProgress?.({ ratio, label, stage });
      },
    });
    return blob;
  } catch (err) {
    // If the worker proxy failed, retry once on the main thread (slower
    // but unblocks environments where the worker can't spawn).
    const msg = err instanceof Error ? err.message : String(err);
    const isWorkerError =
      msg.includes("worker") ||
      msg.includes("Worker") ||
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError");
    if (isWorkerError) {
      const blob = await removeBackground(input, {
        signal: controller.signal,
        model: modelForQuality(quality),
        proxyToWorker: false,
        device: "cpu",
        output: { format: "image/png", quality: 0.8 },
        progress: (key: string, current: number, total: number) => {
          resetTimer();
          const { label, stage } = describeKey(key);
          const ratio = total > 0 ? Math.min(1, current / total) : 0;
          onProgress?.({ ratio, label, stage });
        },
      });
      return blob;
    }
    // If we aborted due to timeout, surface a clearer message.
    if (controller.signal.reason instanceof Error && controller.signal.reason.message === "TIMEOUT") {
      throw new Error(
        "Background removal timed out. Try a smaller image or the Standard quality mode.",
      );
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onCallerAbort);
  }
}

/**
 * Pre-warm the model (download + instantiate) without processing an image.
 * Called on idle after terms acceptance so the first real removal is fast.
 */
export async function preloadBackgroundRemovalModel(
  quality: ModelQuality = "standard",
  onProgress?: (info: ProgressInfo) => void,
): Promise<void> {
  try {
    const mod = await loadModule();
    if (typeof mod.preload === "function") {
      await mod.preload({
        model: modelForQuality(quality),
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
