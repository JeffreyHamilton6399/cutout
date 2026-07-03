"use client";

import type { ModelQuality, ProgressInfo } from "@/types/cutout";
import { removeBackgroundRmbg, preloadRmbg } from "@/lib/rmbg";

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
 * Light alpha feather — smooths the subject/background edge. RMBG already
 * produces soft edges, so the radius is very small; this just cleans up any
 * residual hard transitions.
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

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

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

  // Very light feather — RMBG edges are already soft, this just polishes.
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
  const { onProgress } = options;

  let blob: Blob;
  try {
    // Primary engine: RMBG-2.0 — best quality, handles hair/dark subjects.
    blob = await removeBackgroundRmbg(input, options);
  } catch (rmbgErr) {
    // Fallback: @imgly isnet — works in more environments, lower quality.
    console.warn("RMBG-2.0 failed, falling back to isnet:", rmbgErr);
    try {
      blob = await removeWithImgly(input, options);
    } catch (imglyErr) {
      // Both engines failed — surface the original RMBG error.
      throw rmbgErr instanceof Error ? rmbgErr : new Error(String(rmbgErr));
    }
  }

  // Light alpha feather for smooth edges.
  try {
    blob = await featherAlpha(blob);
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
