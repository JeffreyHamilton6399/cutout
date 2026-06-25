"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Download,
  Plus,
  Check,
  AlertCircle,
  Loader2,
  Package,
} from "lucide-react";
import type { CutoutImage } from "@/types/cutout";
import {
  downloadBlob,
  downloadAll,
  exportWithBackground,
  withExtension,
  formatBytes,
} from "@/lib/image-utils";

interface BatchViewProps {
  images: CutoutImage[];
  /** Map of imageId → raw transparent PNG blob (kept by parent). */
  transparentPngs: Record<string, Blob>;
  onAddMore: () => void;
  onDownloadOne: (image: CutoutImage) => void;
}

export function BatchView({
  images,
  transparentPngs,
  onAddMore,
  onDownloadOne,
}: BatchViewProps) {
  const doneCount = images.filter((i) => i.status === "done").length;
  const errorCount = images.filter((i) => i.status === "error").length;
  const allDone = doneCount === images.length;

  const handleDownloadAll = async () => {
    const ready = images.filter((i) => i.status === "done");
    const items: { blob: Blob; filename: string }[] = [];
    for (const img of ready) {
      const png = transparentPngs[img.id];
      if (!png) continue;
      try {
        const blob = await exportWithBackground(
          png,
          img.outputFormat,
          img.background,
        );
        const ext = img.outputFormat === "png" ? "png" : "jpg";
        items.push({ blob, filename: withExtension(img.filename, ext) });
      } catch {
        /* skip */
      }
    }
    await downloadAll(items);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          <span>
            {doneCount}/{images.length} done
            {errorCount > 0 && (
              <span className="text-rose-500"> · {errorCount} failed</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onAddMore}
            className="h-7 gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
          <Button
            size="sm"
            onClick={handleDownloadAll}
            disabled={!allDone || doneCount === 0}
            className="h-7 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Download all
          </Button>
        </div>
      </div>

      {/* Rows */}
      <ScrollArea className="flex-1">
        <div className="space-y-1.5 p-2 sm:p-3">
          {images.map((img) => (
            <BatchRow
              key={img.id}
              image={img}
              onDownload={() => onDownloadOne(img)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function BatchRow({
  image,
  onDownload,
}: {
  image: CutoutImage;
  onDownload: () => void;
}) {
  const status = image.status;
  const pct = Math.round((image.progress.ratio ?? 0) * 100);

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-2">
      {/* Thumb before→after */}
      <div className="flex shrink-0 items-center gap-1">
        <Thumb src={image.originalUrl} />
        <span className="text-[10px] text-muted-foreground">→</span>
        <Thumb src={image.resultUrl} transparent />
      </div>

      {/* Filename + status */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium" title={image.filename}>
          {image.filename}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">
          {image.width && image.height
            ? `${image.width}×${image.height} · `
            : ""}
          {formatBytes(image.file.size)}
        </p>

        {status === "done" ? (
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
            <Check className="h-3 w-3" /> Ready
          </p>
        ) : status === "error" ? (
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-rose-500">
            <AlertCircle className="h-3 w-3" /> {image.error ?? "Failed"}
          </p>
        ) : (
          <div className="mt-1 flex items-center gap-1.5">
            <Progress value={pct} className="h-1 max-w-[160px]" />
            <span className="text-[10px] text-muted-foreground">{pct}%</span>
          </div>
        )}
      </div>

      {/* Action */}
      <div className="shrink-0">
        {status === "done" ? (
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={onDownload}
            aria-label={`Download ${image.filename}`}
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        ) : status === "error" ? (
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
            <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
          </Button>
        ) : (
          <span className="flex h-7 w-7 items-center justify-center text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </span>
        )}
      </div>
    </div>
  );
}

function Thumb({
  src,
  transparent,
}: {
  src?: string;
  transparent?: boolean;
}) {
  return (
    <div
      className={cn(
        "h-12 w-12 shrink-0 overflow-hidden rounded-md border",
        transparent && "checkerboard",
      )}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-contain" />
      ) : (
        <div className="h-full w-full bg-muted" />
      )}
    </div>
  );
}

// Re-export downloadBlob for parent usage if needed.
export { downloadBlob };
