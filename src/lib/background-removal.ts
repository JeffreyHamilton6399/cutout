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
    return { label: "Loading AI model (one-time download)", stage: "model" };
  }
  if (k.startsWith("compute") || k.startsWith("inference")) {
    return { label: "Removing background…", stage: "inference" };
  }
  return { label: "Processing…", stage: "inference" };
}

/**
 * Smooth the hard alpha edges of the model output. The isnet model produces
 * a binary-ish alpha matte with jagged transitions; a light blur on the
 * alpha channel (only) softens the subject/background edge, eliminating
 * the pixelated halo visible on hair and shoulders. RGB is preserved.
 *
 * Runs on a canvas at the output resolution — cheap (a few ms).
 */
async function featherAlpha(pngBlob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(pngBlob);
  const w = bitmap.width;
  const h = bitmap.height;

  let canvas: OffscreenCanvas | HTMLCanvasElement;
  try {
    canvas = new OffscreenCanvas(w, h);
  } catch {
    canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = (canvas as OffscreenCanvas).getContext
    ? (canvas as OffscreenCanvas).getContext("2d")!
    : (canvas as HTMLCanvasElement).getContext("2d")!;

  // Draw the source (RGBA) — we'll blur just the alpha via a temp canvas.
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  // Read pixels to access the alpha channel.
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Build an alpha-only mask canvas, blur it, and stamp the blurred alpha
  // back onto the original RGBA. This avoids color-bleeding that would
  // happen if we blurred the full RGBA.
  let maskCanvas: OffscreenCanvas | HTMLCanvasElement;
  try {
    maskCanvas = new OffscreenCanvas(w, h);
  } catch {
    maskCanvas = document.createElement("canvas");
    maskCanvas.width = w;
    maskCanvas.height = h;
  }
  const maskCtx = (maskCanvas as OffscreenCanvas).getContext
    ? (maskCanvas as OffscreenCanvas).getContext("2d")!
    : (maskCanvas as HTMLCanvasElement).getContext("2d")!;
  const maskData = maskCtx.createImageData(w, h);
  for (let i = 0; i < data.length; i += 4) {
    // Write the alpha value into all channels of the mask so the blur
    // operates on a grayscale image of the alpha.
    const a = data[i + 3];
    maskData.data[i] = a;
    maskData.data[i + 1] = a;
    maskData.data[i + 2] = a;
    maskData.data[i + 3] = 255;
  }
  maskCtx.putImageData(maskData, 0, 0);

  // Blur the mask. Radius scales with image size so it's proportional —
  // bigger images get a slightly larger feather, but capped to avoid
  // softening fine detail like individual hair strands too much.
  const radius = Math.max(0.6, Math.min(1.5, Math.max(w, h) / 1500));
  (maskCtx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).filter = `blur(${radius}px)`;
  // Draw the mask onto itself with the blur filter active.
  (maskCtx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).drawImage(maskCanvas as CanvasImageSource, 0, 0);
  (maskCtx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).filter = "none";

  const blurredMask = maskCtx.getImageData(0, 0, w, h).data;

  // Stamp the blurred alpha back onto the original RGBA.
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = blurredMask[i];
  }
  ctx.putImageData(imageData, 0, 0);

  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/png" });
  }
  return new Promise<Blob>((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("feather failed"))),
      "image/png",
    ),
  );
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

  const run = (useWorker: boolean) =>
    removeBackground(input, {
      signal: controller.signal,
      model: modelForQuality(quality),
      proxyToWorker: useWorker,
      device: "cpu",
      output: { format: "image/png", quality: 0.8 },
      progress: (key: string, current: number, total: number) => {
        resetTimer();
        const { label, stage } = describeKey(key);
        const ratio = total > 0 ? Math.min(1, current / total) : 0;
        onProgress?.({ ratio, label, stage });
      },
    });

  try {
    let blob: Blob;
    try {
      blob = await run(true);
    } catch (err) {
      // If the worker proxy failed, retry once on the main thread (slower
      // but unblocks environments where the worker can't spawn).
      const msg = err instanceof Error ? err.message : String(err);
      const isWorkerError =
        msg.includes("worker") ||
        msg.includes("Worker") ||
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError");
      if (!isWorkerError) throw err;
      blob = await run(false);
    }

    // Smooth the jagged alpha edges before returning — the isnet model
    // produces a hard matte that looks pixelated on hair/shoulders.
    try {
      blob = await featherAlpha(blob);
    } catch {
      // If feathering fails (rare), return the raw result — still usable.
    }
    return blob;
  } catch (err) {
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
