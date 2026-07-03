"use client";

import type { ProgressInfo } from "@/types/cutout";

/**
 * Background removal using RMBG-2.0 (BRIA AI) via Transformers.js.
 *
 * RMBG-2.0 is the best open-source background-removal model that runs in the
 * browser. Unlike the older isnet model, it produces a proper soft alpha matte
 * (not a binary mask), so it handles hair, fur, and dark subjects correctly —
 * the cases where isnet inverts or produces jagged edges.
 *
 * The model is ~120MB (one-time download, cached by the browser). Everything
 * is client-side — no photo ever leaves the device.
 */

type RmbgOptions = {
  onProgress?: (info: ProgressInfo) => void;
  signal?: AbortSignal;
};

type ModelType = {
  __call__: (inputs: { input: Float32Array | number[][] }) => Promise<{
    output: Array<{ data: Float32Array; dims: number[] }>;
  }>;
};

type ProcessorType = {
  __call__: (image: unknown) => Promise<{
    pixel_values: { data: Float32Array; dims: number[] };
  }>;
};

let modelPromise: Promise<ModelType> | null = null;
let processorPromise: Promise<ProcessorType> | null = null;

/**
 * Detect WebGPU availability. WebGPU runs the model on the GPU — 10-50x
 * faster than WASM and allows higher-resolution inference. Falls back to
 * WASM automatically when unavailable.
 */
async function detectWebGPU(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) return false;
    const adapter = await (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu?.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

/**
 * Lazy-load the RMBG-2.0 model + image processor. Uses WebGPU when available
 * (much faster), falls back to WASM.
 */
async function loadModel(onProgress?: (info: ProgressInfo) => void) {
  if (!modelPromise) {
    modelPromise = (async () => {
      const transformers = await import("@huggingface/transformers");
      const { AutoModel, AutoProcessor, env } = transformers;

      env.allowLocalModels = false;
      env.allowRemoteModels = true;

      // Use WebGPU if the browser supports it — dramatically faster inference.
      const hasWebGPU = await detectWebGPU();
      if (hasWebGPU) {
        env.backends.onnx.wasm.proxy = false;
      }

      const progress_callback = (data: { status: string; progress?: number; file?: string }) => {
        if (data.status === "progress" && data.progress != null) {
          onProgress?.({
            ratio: data.progress / 100,
            label: "Loading RMBG-2.0 model (one-time 120MB download)",
          });
        } else if (data.status === "ready") {
          onProgress?.({ ratio: 1, label: "Model loaded" });
        }
      };

      const [model, processor] = await Promise.all([
        AutoModel.from_pretrained("briaai/RMBG-2.0", {
          config: { model_type: "custom" },
          device: hasWebGPU ? "webgpu" : "wasm",
          dtype: hasWebGPU ? "fp32" : "fp32",
          progress_callback,
        }) as Promise<ModelType>,
        AutoProcessor.from_pretrained("briaai/RMBG-2.0", {
          config: {
            do_normalize: true,
            do_pad: false,
            do_rescale: true,
            do_resize: true,
            image_mean: [0.5, 0.5, 0.5],
            image_std: [1, 1, 1],
            resample: 2,
            rescale_factor: 0.00392156862745098,
            size: { width: 1024, height: 1024 },
          },
        }) as Promise<ProcessorType>,
      ]);

      processorPromise = Promise.resolve(processor);
      return model;
    })();
  }
  return modelPromise;
}

async function loadProcessor(): Promise<ProcessorType> {
  if (!processorPromise) {
    await loadModel();
  }
  return processorPromise!;
}

/**
 * Remove the background using RMBG-2.0. Returns a transparent PNG Blob.
 */
export async function removeBackgroundRmbg(
  input: Blob | File,
  options: RmbgOptions = {},
): Promise<Blob> {
  const { onProgress, signal } = options;

  const model = await loadModel(onProgress);
  const processor = await loadProcessor();

  onProgress?.({ ratio: 0, label: "Preparing image…" });

  // Load the image via RawImage.
  const { RawImage } = await import("@huggingface/transformers");
  const url = URL.createObjectURL(input);
  let image: InstanceType<typeof RawImage>;
  try {
    image = await RawImage.fromURL(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  onProgress?.({ ratio: 0.1, label: "Removing background…" });

  // Preprocess: resize to 1024x1024, normalize → tensor.
  const { pixel_values } = await processor(image);

  // Run the model.
  const { output } = await model({ input: pixel_values.data });

  // The output is a soft mask (0..1). Resize it back to the original
  // image dimensions and apply it as the alpha channel.
  onProgress?.({ ratio: 0.8, label: "Applying mask…" });

  const maskTensor = output[0];
  // Convert mask (0..1 floats) to a RawImage, then resize to original size.
  const maskData = new Uint8ClampedArray(maskTensor.data.length);
  for (let i = 0; i < maskTensor.data.length; i++) {
    maskData[i] = Math.round(maskTensor.data[i] * 255);
  }

  // The mask is at 1024x1024 — resize to original image dimensions.
  const maskWidth = maskTensor.dims[maskTensor.dims.length - 1] || 1024;
  const maskHeight = maskTensor.dims[maskTensor.dims.length - 2] || 1024;

  const maskImage = new RawImage(maskData, maskWidth, maskHeight, 1);
  const resizedMask = await maskImage.resize(image.width, image.height);

  // Composite: draw the original image, then use the mask as alpha.
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  try {
    canvas = new OffscreenCanvas(image.width, image.height);
  } catch {
    canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
  }
  const ctx = (canvas as OffscreenCanvas).getContext
    ? (canvas as OffscreenCanvas).getContext("2d")!
    : (canvas as HTMLCanvasElement).getContext("2d")!;

  // Draw the original image.
  // RawImage.data is RGBA; create an ImageData from it.
  const originalData = new Uint8ClampedArray(image.data);
  const imageData = new ImageData(originalData, image.width, image.height);
  ctx.putImageData(imageData, 0, 0);

  // Read back, apply mask as alpha.
  const composited = ctx.getImageData(0, 0, image.width, image.height);
  const maskPixels = resizedMask.data;
  for (let i = 0; i < composited.data.length; i += 4) {
    const maskIdx = i / 4;
    composited.data[i + 3] = maskPixels[maskIdx] ?? 255;
  }
  ctx.putImageData(composited, 0, 0);

  onProgress?.({ ratio: 1, label: "Done" });

  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/png" });
  }
  return new Promise<Blob>((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("RMBG export failed"))),
      "image/png",
    ),
  );
}

/**
 * Preload the RMBG-2.0 model so the first real removal is fast.
 */
export async function preloadRmbg(
  onProgress?: (info: ProgressInfo) => void,
): Promise<void> {
  try {
    await loadModel(onProgress);
  } catch {
    // Preload is best-effort.
  }
}
