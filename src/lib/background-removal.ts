"use client";

import type { ModelQuality, ProgressInfo } from "@/types/cutout";
import { removeBackgroundRmbg, preloadRmbg } from "@/lib/rmbg";
import { abortable } from "@/lib/concurrency";

/**
 * Background-removal engine.
 *
 * Primary: RMBG-2.0 (BRIA AI) via Transformers.js — the best open-source
 * in-browser model. Produces a proper soft alpha matte, handles hair/fur/dark
 * subjects correctly. ~120MB one-time download.
 *
 * Fallback: @imgly/background-removal (isnet_fp16) — older model, ~44MB, used
 * if RMBG fails to load (network issue, unsupported browser, etc.).
 *
 * Everything runs client-side. No photo ever leaves the device.
 */

type RemoveBgOptions = {
  onProgress?: (info: ProgressInfo) => void;
  signal?: AbortSignal;
  quality?: ModelQuality;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 120_000;


let imglyPromise: Promise<typeof import("@imgly/background-removal")> | null =
  null;

function loadImgly() {
  if (!imglyPromise) {
    imglyPromise = import("@imgly/background-removal");
  }
  return imglyPromise;
}

function modelForQuality(quality: ModelQuality): "isnet_fp16" | "isnet" {
  return quality === "maximum" ? "isnet" : "isnet_fp16";
}

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
 * Full post-processing pipeline for professional-quality cutouts:
 *   1. Mask refinement — contrast curve + noise threshold
 *   2. Color decontamination — remove background color fringe from edges
 *   3. Light alpha feather — smooth the subject/background transition
 *
 * Color decontamination is the key step that separates amateur cutouts from
 * remove.bg-quality ones. When a subject is cut from a colored background,
 * the background color bleeds into the semi-transparent edge pixels (especially
 * hair). When composited over a new background, that old color shows through
 * as a visible fringe. Decontamination estimates the background color and
 * removes it from the edge pixels' RGB.
 */
async function postProcess(pngBlob: Blob): Promise<Blob> {
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

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // ---- Step 1: Mask refinement (contrast curve + noise threshold) ----
  // Push weak detections to 0 (clean transparent) and strong detections to
  // 255 (clean opaque), keeping a smooth transition only in the 0.3–0.7
  // range for hair/fur. Threshold out dust (alpha < 10).
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a < 10) {
      // Dust — kill it.
      data[i] = 0;
    } else if (a > 230) {
      // Solid subject — snap to opaque.
      data[i] = 255;
    } else {
      // Transition zone — apply an S-curve to sharpen the edge while
      // keeping it smooth. Maps 10..230 → 0..255 with contrast.
      const t = (a - 10) / 220; // 0..1
      // Smoothstep S-curve for a natural transition.
      const eased = t * t * (3 - 2 * t);
      data[i] = Math.round(eased * 255);
    }
  }

  // ---- Step 2: Color decontamination ----
  // Estimate the background color by sampling the image border pixels (the
  // outermost rows/cols are almost always background). Then for each
  // semi-transparent pixel, subtract the background tint so it doesn't
  // fringe when composited over a new background.
  let bgR = 0,
    bgG = 0,
    bgB = 0,
    bgCount = 0;
  const sampleBorder = (x: number, y: number) => {
    const idx = (y * w + x) * 4;
    // Sample from the original bitmap colors (pre-mask), focusing on pixels
    // that the mask flagged as background (alpha < 128).
    if (data[idx + 3] < 128) {
      bgR += data[idx];
      bgG += data[idx + 1];
      bgB += data[idx + 2];
      bgCount++;
    }
  };
  // Sample all 4 borders.
  for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 50))) {
    sampleBorder(x, 0);
    sampleBorder(x, h - 1);
  }
  for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 50))) {
    sampleBorder(0, y);
    sampleBorder(w - 1, y);
  }
  if (bgCount > 0) {
    bgR /= bgCount;
    bgG /= bgCount;
    bgB /= bgCount;
  }

  // For semi-transparent edge pixels, remove the background tint from RGB.
  // The more transparent a pixel, the more background color it contains.
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a > 0 && a < 255) {
      // How much background is blended in (0 = opaque, 1 = fully transparent).
      const bgAmount = 1 - a / 255;
      // Subtract the background color proportionally. Clamp to valid range.
      data[i] = Math.max(0, Math.min(255, data[i] - bgR * bgAmount * 0.6));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] - bgG * bgAmount * 0.6));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] - bgB * bgAmount * 0.6));
    }
  }

  // ---- Step 3: Light alpha feather ----
  // Blur the alpha channel slightly for a smooth edge. We do this on a
  // separate mask canvas to avoid color bleeding.
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
    const a = data[i + 3];
    maskData.data[i] = a;
    maskData.data[i + 1] = a;
    maskData.data[i + 2] = a;
    maskData.data[i + 3] = 255;
  }
  maskCtx.putImageData(maskData, 0, 0);

  const radius = Math.max(0.4, Math.min(0.8, Math.max(w, h) / 2500));
  (maskCtx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).filter = `blur(${radius}px)`;
  (maskCtx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).drawImage(maskCanvas as CanvasImageSource, 0, 0);
  (maskCtx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).filter = "none";

  const blurredMask = maskCtx.getImageData(0, 0, w, h).data;
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
 * Fallback: remove background using @imgly isnet model.
 */
async function removeWithImgly(
  input: Blob | File,
  options: RemoveBgOptions,
): Promise<Blob> {
  const { onProgress, signal, quality = "standard", timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const mod = await loadImgly();
  const removeBackground = mod.removeBackground;

  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onCallerAbort, { once: true });
  }

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
    // `controller.signal` merges the caller's abort with the local timeout;
    // the library takes no signal of its own, so we race it here.
    const blob = await abortable(
      removeBackground(input, {
        model: modelForQuality(quality),
        proxyToWorker: true,
        device: "cpu",
        output: { format: "image/png", quality: 0.8 },
        progress: (key: string, current: number, total: number) => {
          resetTimer();
          const { label } = describeKey(key);
          const ratio = total > 0 ? Math.min(1, current / total) : 0;
          onProgress?.({ ratio, label });
        },
      }),
      controller.signal,
    );
    return blob;
  } finally {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onCallerAbort);
  }
}

/**
 * Remove the background from a File/Blob and return a transparent PNG Blob.
 *
 * Tries RMBG-2.0 first (best quality). If that fails, falls back to @imgly
 * isnet. Applies a light alpha feather for smooth edges.
 */
export async function removeImageBackground(
  input: Blob | File,
  options: RemoveBgOptions = {},
): Promise<Blob> {
  const { onProgress, signal } = options;

  let blob: Blob;
  try {
    // Primary engine: RMBG-2.0 — best quality, handles hair/dark subjects.
    // transformers.js can't be interrupted, so the signal is honoured by
    // racing rather than by stopping the work.
    blob = await abortable(removeBackgroundRmbg(input, options), signal);
  } catch (rmbgErr) {
    // A cancelled run isn't an engine failure — don't spend the user's CPU
    // starting the fallback on work they just asked us to stop.
    if (signal?.aborted) throw rmbgErr;

    // Fallback: @imgly isnet — works in more environments, lower quality.
    console.warn("RMBG-2.0 failed, falling back to isnet:", rmbgErr);
    try {
      blob = await removeWithImgly(input, options);
    } catch {
      // Both engines failed — surface the original RMBG error.
      throw rmbgErr instanceof Error ? rmbgErr : new Error(String(rmbgErr));
    }
  }

  // Nothing below is worth doing for a run the user already cancelled.
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  // Professional post-processing: mask refinement + color decontamination
  // + edge feather. This is what separates an ok cutout from a remove.bg-
  // quality one.
  try {
    blob = await postProcess(blob);
  } catch {
    // Non-critical — return the raw result.
  }

  return blob;
}

/**
 * Pre-warm the model so the first real removal is fast. Preloads RMBG-2.0
 * (primary); the @imgly fallback loads on-demand if needed.
 */
export async function preloadBackgroundRemovalModel(
  quality: ModelQuality = "standard",
  onProgress?: (info: ProgressInfo) => void,
): Promise<void> {
  try {
    await preloadRmbg(onProgress);
  } catch {
    // Preload is best-effort.
  }
}
