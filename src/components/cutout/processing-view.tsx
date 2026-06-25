"use client";

import * as React from "react";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import type { CutoutImage } from "@/types/cutout";

interface ProcessingViewProps {
  image: CutoutImage;
}

/**
 * Single-image processing view. Shows the original image with a subtle
 * scanning line animation + a progress bar with the current stage label.
 * No spinner (per design rules) — progress bar only.
 */
export function ProcessingView({ image }: ProcessingViewProps) {
  const pct = Math.round((image.progress.ratio ?? 0) * 100);

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-5">
        {/* Image with scanning overlay */}
        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border bg-muted">
          {/* original photo for scanning preview */}
          <img
            src={image.originalUrl}
            alt={image.filename}
            className="h-full w-full object-contain"
          />
          {/* Scanning line */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="scan-line absolute left-0 right-0 h-px bg-emerald-400 shadow-[0_0_12px_2px_rgba(16,185,129,0.6)]" />
          </div>
          {/* Subtle dim */}
          <div className="pointer-events-none absolute inset-0 bg-black/10" />
        </div>

        {/* Stage + progress */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
            <span className="font-medium">{image.progress.label}</span>
          </div>
          <Progress value={pct} className="h-1.5" />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>
              {image.status === "loading-model"
                ? "One-time model download"
                : image.status === "decoding"
                  ? "Decoding image"
                  : "In-browser inference"}
            </span>
            <span>{pct}%</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .scan-line {
          animation: cutout-scan 1.8s ease-in-out infinite;
        }
        @keyframes cutout-scan {
          0% {
            top: 0%;
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            top: 100%;
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
