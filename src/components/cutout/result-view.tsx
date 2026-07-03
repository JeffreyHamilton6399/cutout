"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  Plus,
  Eraser,
  Palette,
  Check,
  ChevronDown,
} from "lucide-react";
import type {
  CutoutImage,
  DownloadFormat,
  BackgroundChoice,
} from "@/types/cutout";
import {
  downloadBlob,
  exportWithBackground,
  withExtension,
  resolveBgCss,
  extForFormat,
  formatSupportsAlpha,
} from "@/lib/image-utils";

interface ResultViewProps {
  image: CutoutImage;
  /** Raw transparent PNG blob — kept in memory by the parent for export. */
  transparentPng: Blob;
  onNewFile: () => void;
  onRefine: () => void;
  onUpdateImage: (patch: Partial<CutoutImage>) => void;
}

export function ResultView({
  image,
  transparentPng,
  onNewFile,
  onRefine,
  onUpdateImage,
}: ResultViewProps) {
  const [exporting, setExporting] = React.useState<DownloadFormat | null>(null);
  const [customColor, setCustomColor] = React.useState("#10b981");

  const bgKind = image.background.kind;
  const downloadFormat = image.downloadFormat;

  /** Set the background choice. For "custom", seed with the current color. */
  const setBackground = (kind: BackgroundChoice["kind"]) => {
    if (kind === "custom") {
      onUpdateImage({ background: { kind: "custom", color: customColor } });
    } else {
      onUpdateImage({ background: { kind } });
    }
  };

  /**
   * Export and download in the chosen format. If the format can't hold alpha
   * (JPEG) and the background is transparent, we composite onto white
   * automatically inside `exportWithBackground`.
   */
  const handleDownload = async (format: DownloadFormat) => {
    setExporting(format);
    try {
      const blob = await exportWithBackground(
        transparentPng,
        format,
        image.background,
      );
      downloadBlob(blob, withExtension(image.filename, extForFormat(format)));
    } finally {
      setExporting(null);
    }
  };

  // Live preview background for the "after" panel.
  const afterBgCss = resolveBgCss(image.background);
  const afterTransparent = image.background.kind === "none";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Preview area — always compare (before → after) */}
      <div className="flex flex-1 items-center justify-center gap-3 overflow-hidden p-3 sm:p-4">
        <PreviewCard
          label="Before"
          url={image.originalUrl}
          className="flex-1"
        />
        <PreviewCard
          label="After"
          url={image.resultUrl}
          transparent={afterTransparent}
          backgroundColor={afterBgCss}
          className="flex-1"
        />
      </div>

      {/* Controls bar */}
      <div className="shrink-0 border-t bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-2.5 px-3 py-2.5 sm:px-4">
          {/* Background picker + refine */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Palette className="h-3 w-3" />
                Background
              </span>
              <ToggleGroup
                type="single"
                value={bgKind}
                onValueChange={(v) =>
                  v && setBackground(v as BackgroundChoice["kind"])
                }
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem
                  value="none"
                  className="gap-1.5 px-2.5 text-xs"
                >
                  <span
                    className={cn(
                      "h-3 w-3 rounded-sm border checkerboard",
                      !afterTransparent && "opacity-50",
                    )}
                  />
                  Transparent
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="white"
                  className="gap-1.5 px-2.5 text-xs"
                >
                  <span className="h-3 w-3 rounded-sm border bg-white" />
                  White
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="custom"
                  className="gap-1.5 px-2.5 text-xs"
                >
                  <span
                    className="h-3 w-3 rounded-sm border"
                    style={{ backgroundColor: customColor }}
                  />
                  Custom
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={onRefine}
              className="h-7 shrink-0 gap-1.5 text-xs"
            >
              <Eraser className="h-3.5 w-3.5" />
              Refine edges
            </Button>
          </div>

          {/* Custom color picker (only when custom is selected) */}
          {bgKind === "custom" && (
            <div className="flex items-center gap-2 pl-1">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => {
                    setCustomColor(e.target.value);
                    onUpdateImage({
                      background: { kind: "custom", color: e.target.value },
                    });
                  }}
                  className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <span className="font-mono uppercase">{customColor}</span>
              </label>
            </div>
          )}

          {/* Action row: download (with format dropdown) + new file */}
          <div className="flex items-center gap-2 pt-0.5">
            <div className="flex flex-1 overflow-hidden rounded-md">
              {/* Primary download button — uses the current default format */}
              <Button
                size="sm"
                onClick={() => handleDownload(downloadFormat)}
                disabled={exporting !== null}
                className="h-9 flex-1 gap-1.5 rounded-r-none bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {exporting ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {exporting
                  ? "Preparing…"
                  : `Download ${downloadFormat.toUpperCase()}`}
              </Button>

              {/* Format dropdown — pick PNG / JPEG / WebP */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    disabled={exporting !== null}
                    className="h-9 w-9 shrink-0 rounded-l-none border-l border-emerald-700/40 bg-emerald-600 px-0 text-white hover:bg-emerald-700"
                    aria-label="Choose download format"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Download as
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(
                    [
                      {
                        format: "png",
                        label: "PNG",
                        hint: "Transparent · lossless",
                      },
                      {
                        format: "webp",
                        label: "WebP",
                        hint: formatSupportsAlpha("webp")
                          ? "Transparent · smaller"
                          : "Compressed",
                      },
                      {
                        format: "jpeg",
                        label: "JPEG",
                        hint: formatSupportsAlpha("jpeg")
                          ? "Compressed"
                          : "White bg · compressed",
                      },
                    ] as { format: DownloadFormat; label: string; hint: string }[]
                  ).map((opt) => (
                    <DropdownMenuItem
                      key={opt.format}
                      onSelect={() => {
                        // Persist as the new default format, then download.
                        onUpdateImage({ downloadFormat: opt.format });
                        void handleDownload(opt.format);
                      }}
                      className="flex cursor-pointer items-center justify-between gap-3"
                    >
                      <span className="flex flex-col">
                        <span className="text-sm font-medium">{opt.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {opt.hint}
                        </span>
                      </span>
                      {downloadFormat === opt.format && (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={onNewFile}
              className="h-9 w-9 shrink-0"
              aria-label="New file"
              title="New file"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewCard({
  label,
  url,
  transparent,
  backgroundColor = "transparent",
  className,
}: {
  label: string;
  url?: string;
  transparent?: boolean;
  backgroundColor?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex max-h-full min-h-0 items-center justify-center overflow-hidden rounded-lg border",
        transparent && "checkerboard",
        className,
      )}
      style={{ backgroundColor: transparent ? undefined : backgroundColor }}
    >
      {url ? (
        <img
          src={url}
          alt={label}
          className="max-h-full max-w-full object-contain"
        />
      ) : null}
      <span className="pointer-events-none absolute left-2 top-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
        {label}
      </span>
    </div>
  );
}
