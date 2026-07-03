"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RotateCw, Plus } from "lucide-react";
import type { CutoutImage } from "@/types/cutout";

interface ErrorViewProps {
  image: CutoutImage;
  /** Re-process the same image. */
  onRetry: () => void;
  /** Discard and return to the dropzone. */
  onNewFile: () => void;
}

/**
 * Shown when background removal fails or times out. Surfaces the error
 * message and offers Retry (same image) + New file. Replaces the old
 * behavior of leaving the user on a blank screen when processing errored.
 */
export function ErrorView({ image, onRetry, onNewFile }: ErrorViewProps) {
  const message = image.error || "Something went wrong while removing the background.";

  // Tailor the hint to common failure modes.
  const hint = message.toLowerCase().includes("timeout")
    ? "The model took too long — this usually means the image was too large or the device is slow. Try again, or drop a smaller image."
    : message.toLowerCase().includes("memory") || message.toLowerCase().includes("oom")
      ? "The device ran out of memory. Try a smaller image."
      : "Try again, or drop a different image. If it keeps failing, switch to Standard quality in Settings.";

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5 text-center">
        {/* Original thumbnail so the user sees which image failed */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-7 w-7" />
        </div>

        <div className="space-y-1.5">
          <p className="text-base font-semibold">Couldn&apos;t remove the background</p>
          <p className="mx-auto max-w-sm text-xs text-muted-foreground">{hint}</p>
        </div>

        {image.originalUrl && (
          <div className="mx-auto flex w-fit items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5">
            <img
              src={image.originalUrl}
              alt={image.filename}
              className="h-8 w-8 rounded object-cover"
            />
            <span className="max-w-[200px] truncate text-xs text-muted-foreground">
              {image.filename}
            </span>
          </div>
        )}

        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            onClick={onRetry}
            className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <RotateCw className="h-4 w-4" />
            Try again
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onNewFile}
            className="h-9 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            New file
          </Button>
        </div>
      </div>
    </div>
  );
}
