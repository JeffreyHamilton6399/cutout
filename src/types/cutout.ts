// Shared public types for the Cutout app.

/**
 * Background applied behind the cut-out subject.
 * - "none"    → keep transparency (checkerboard preview)
 * - "white"   → solid white backdrop
 * - "custom"  → user-picked hex color
 *
 * (Black was intentionally removed — the three options above cover the
 * realistic use cases and keep the UI minimal.)
 */
export type BackgroundChoice =
  | { kind: "none" }
  | { kind: "white" }
  | { kind: "custom"; color: string };

/**
 * Download format. PNG and WebP both support alpha (transparency); JPEG does
 * not, so when the user picks JPEG with a transparent background we composite
 * onto white automatically at export time.
 */
export type DownloadFormat = "png" | "jpeg" | "webp";

export type ImageStatus =
  | "queued"
  | "decoding"
  | "loading-model"
  | "processing"
  | "done"
  | "error";

export interface ProgressInfo {
  /** 0..1 overall progress for a single image (model load + inference). */
  ratio: number;
  /** Human-readable stage label, e.g. "Loading AI model..." */
  label: string;
}

export interface CutoutImage {
  id: string;
  file: File;
  /** Original object URL for preview (revoked on cleanup). */
  originalUrl: string;
  /** Result object URL (transparent PNG), set when status === "done". */
  resultUrl?: string;
  /** Decoded bitmap dimensions (set after decode). */
  width?: number;
  height?: number;
  status: ImageStatus;
  progress: ProgressInfo;
  error?: string;
  /** Original filename, sanitized. */
  filename: string;
  /** Background the user picked for preview + export. */
  background: BackgroundChoice;
  /** Default download format. */
  downloadFormat: DownloadFormat;
  /** When true, the result has been edited with the refine tool. */
  refined?: boolean;
}

export type AppMode = "single" | "batch";

export interface AppSettings {
  theme: "light" | "dark" | "system";
  termsAccepted: boolean;
  termsAcceptedAt: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  termsAccepted: false,
  termsAcceptedAt: null,
};
