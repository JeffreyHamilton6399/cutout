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
 * Letterbox the input image onto a slightly larger neutral-gray canvas before
 * sending it to the model. This is the key fix for the "removed the wrong
 * part" problem on dark subjects.
 *
 * Why it works: the isnet model segments foreground by looking for a bounded
 * subject against a background. When a dark subject (e.g. a black hoodie)
 * fills the frame edge-to-edge against a colored background, the model can't
 * tell which is the bounded subject and sometimes inverts — keeping the
 * background and removing the subject. By padding the image with a neutral
 * gray border, we give the model a clear visual frame: the subject is now
 * unambiguously the bounded content in the center, and the border reads as
 * "edge", not as subject.
 *
 * The model's alpha output is at the letterboxed size, so we crop the
 * padding back off afterwards to return a result at the original dimensions.
 */
const LETTERBOX_PAD_RATIO = 0.1; // 10% padding on each side
const LETTERBOX_COLOR = "#808080"; // neutral mid-gray

async function letterbox(
  blob: Blob,
): Promise<{ blob: Blob; padX: number; padY: number }> {
  const bitmap = await createImageBitmap(blob);
  const w = bitmap.width;
  const h = bitmap.height;
  const padX = Math.round(w * LETTERBOX_PAD_RATIO);
  const padY = Math.round(h * LETTERBOX_PAD_RATIO);
  const outW = w + padX * 2;
  const outH = h + padY * 2;

  let canvas: OffscreenCanvas | HTMLCanvasElement;
  try {
    canvas = new OffscreenCanvas(outW, outH);
  } catch {
    canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
  }
  const ctx = (canvas as OffscreenCanvas).getContext
    ? (canvas as OffscreenCanvas).getContext("2d")!
    : (canvas as HTMLCanvasElement).getContext("2d")!;
  ctx.fillStyle = LETTERBOX_COLOR;
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(bitmap, padX, padY, w, h);
  bitmap.close?.();

  if (canvas instanceof OffscreenCanvas) {
    return { blob: await canvas.convertToBlob({ type: "image/png" }), padX, padY };
  }
  const out = await new Promise<Blob>((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("letterbox failed"))),
      "image/png",
    ),
  );
  return { blob: out, padX, padY };
}

/**
 * Crop the letterbox padding back off the model's output so the result is at
 * the original image dimensions.
 */
async function unletterbox(
  pngBlob: Blob,
  padX: number,
  padY: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(pngBlob);
  const w = bitmap.width - padX * 2;
  const h = bitmap.height - padY * 2;

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
  // Draw only the center region (skip the padding).
  ctx.drawImage(
    bitmap,
    padX,
    padY,
    w,
    h,
    0,
    0,
    w,
    h,
  );
  bitmap.close?.();

  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/png" });
  }
  return new Promise<Blob>((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("unletterbox failed"))),
      "image/png",
    ),
  );
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

  const run = (img: Blob | File, useWorker: boolean) =>
    removeBackground(img, {
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
    // Letterbox the input onto a neutral-gray padded canvas before
    // inference. This gives the model a clear frame of reference so it
    // doesn't confuse a dark subject with the background — the fix for
    // "it removed the wrong part" on dark subjects (e.g. black hoodie
    // on blue background).
    let modelInput: Blob | File = input;
    let padX = 0;
    let padY = 0;
    try {
      const lb = await letterbox(input);
      modelInput = lb.blob;
      padX = lb.padX;
      padY = lb.padY;
    } catch {
      // If letterboxing fails, proceed with the raw input.
    }

    let blob: Blob;
    try {
      blob = await run(modelInput, true);
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
      blob = await run(modelInput, false);
    }

    // Crop the letterbox padding back off so the result matches the
    // original image dimensions.
    if (padX > 0 || padY > 0) {
      try {
        blob = await unletterbox(blob, padX, padY);
      } catch {
        // If unletterbox fails, return the padded result — still usable.
      }
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
