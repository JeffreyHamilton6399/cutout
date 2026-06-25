// Shared public types for the Cutout app.

export type OutputFormat = "png" | "jpeg";

export type BackgroundChoice =
  | { kind: "none" }
  | { kind: "white" }
  | { kind: "black" }
  | { kind: "custom"; color: string };

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
  /** Output mime type the user picked for this image. */
  outputFormat: OutputFormat;
  /** Background color applied when outputFormat === "jpeg". */
  background: BackgroundChoice;
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
