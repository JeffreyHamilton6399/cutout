"use client";

import type { BackgroundChoice, OutputFormat } from "@/types/cutout";

/**
 * Client-side image utilities: HEIC decoding, format export, size guards,
 * and object-URL lifecycle helpers. Everything here runs in the browser.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — guards mobile OOM.

export const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/bmp",
];

export const ACCEPT_ATTR =
  "image/png,image/jpeg,image/webp,image/heic,image/heif,image/bmp,.png,.jpg,.jpeg,.webp,.heic,.heif,.bmp";

export function isHeic(file: File | Blob): boolean {
  const type = file.type.toLowerCase();
  return type === "image/heic" || type === "image/heif";
}

export function isAcceptedFile(file: File): boolean {
  if (file.type && ACCEPTED_TYPES.includes(file.type.toLowerCase())) return true;
  // Fallback to extension check for HEIC (some browsers report empty type).
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "webp", "heic", "heif", "bmp"].includes(ext);
}

/**
 * Decode HEIC → JPEG using heic2any (lazy-loaded). Returns a regular Blob
 * that createImageBitmap / the background-removal library can consume.
 */
export async function decodeHeic(file: File): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Normalize any accepted file into a decodable image Blob (decodes HEIC).
 */
export async function normalizeForProcessing(file: File): Promise<Blob> {
  if (isHeic(file)) {
    return decodeHeic(file);
  }
  return file;
}

/** Create an object URL and remember to revoke it later. */
export function createImageUrl(blob: Blob | File): string {
  return URL.createObjectURL(blob);
}

export function revokeImageUrl(url?: string) {
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

/** Read bitmap dimensions without keeping the bitmap in memory. */
export async function readDimensions(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const w = bitmap.width;
  const h = bitmap.height;
  bitmap.close?.();
  return { width: w, height: h };
}

/**
 * Compose a transparent PNG (the raw AI output) onto a solid background
 * color and export as JPEG. Used when the user picks "JPEG with background".
 */
export async function exportWithBackground(
  transparentPng: Blob,
  format: OutputFormat,
  background: BackgroundChoice,
): Promise<Blob> {
  if (format === "png") {
    return transparentPng;
  }

  const bitmap = await createImageBitmap(transparentPng);
  const width = bitmap.width;
  const height = bitmap.height;

  // Prefer OffscreenCanvas (off-main-thread, no DOM), fall back to a regular
  // canvas for older browsers.
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  try {
    canvas = new OffscreenCanvas(width, height);
  } catch {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = (canvas as OffscreenCanvas).getContext
    ? (canvas as OffscreenCanvas).getContext("2d")!
    : (canvas as HTMLCanvasElement).getContext("2d")!;

  const bgColor = resolveBackgroundColor(background);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to export JPEG"))),
      "image/jpeg",
      0.92,
    );
  });
}

export function resolveBackgroundColor(bg: BackgroundChoice): string {
  switch (bg.kind) {
    case "none":
      return "transparent";
    case "white":
      return "#ffffff";
    case "black":
      return "#000000";
    case "custom":
      return bg.color;
  }
}

/** Trigger a browser download for a blob with the right filename. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been dispatched.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Convert a filename's extension, preserving the base name. */
export function withExtension(filename: string, ext: string): string {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return `${base}.${ext}`;
}

/** Strip any path separators / odd chars from a filename. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180) || "image";
}

/** Format bytes as a human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Trigger a download for every blob, spaced slightly to avoid the browser
 * blocking rapid consecutive downloads. */
export async function downloadAll(
  items: { blob: Blob; filename: string }[],
): Promise<void> {
  for (const item of items) {
    downloadBlob(item.blob, item.filename);
    // Small delay so browsers don't swallow rapid downloads.
    await new Promise((r) => setTimeout(r, 350));
  }
}
