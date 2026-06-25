"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Download,
  Plus,
  Eraser,
  Palette,
  Check,
  ArrowLeftRight,
} from "lucide-react";
import type {
  CutoutImage,
  OutputFormat,
  BackgroundChoice,
} from "@/types/cutout";
import {
  downloadBlob,
  exportWithBackground,
  withExtension,
} from "@/lib/image-utils";

interface ResultViewProps {
  image: CutoutImage;
  /** Raw transparent PNG blob — kept in memory by the parent for export. */
  transparentPng: Blob;
  onNewFile: () => void;
  onRefine: () => void;
  onUpdateImage: (patch: Partial<CutoutImage>) => void;
}

type PreviewMode = "side-by-side" | "before" | "after";

export function ResultView({
  image,
  transparentPng,
  onNewFile,
  onRefine,
  onUpdateImage,
}: ResultViewProps) {
  const [preview, setPreview] = React.useState<PreviewMode>("side-by-side");
  const [exporting, setExporting] = React.useState(false);
  const [customColor, setCustomColor] = React.useState("#10b981");

  const bgKind = image.background.kind;
  const outputFormat = image.outputFormat;

  const setBackground = (kind: BackgroundChoice["kind"]) => {
    if (kind === "custom") {
      onUpdateImage({ background: { kind: "custom", color: customColor } });
    } else if (kind === "none") {
      onUpdateImage({ background: { kind: "none" } });
      onUpdateImage({ outputFormat: "png" });
    } else {
      onUpdateImage({ background: { kind } });
      onUpdateImage({ outputFormat: "jpeg" });
    }
  };

  const setFormat = (format: OutputFormat) => {
    onUpdateImage({ outputFormat: format });
    // If user picks JPEG while bg is "none", bump to white so it's sensible.
    if (format === "jpeg" && image.background.kind === "none") {
      onUpdateImage({ background: { kind: "white" } });
    }
  };

  const handleDownload = async () => {
    setExporting(true);
    try {
      const blob = await exportWithBackground(
        transparentPng,
        outputFormat,
        image.background,
      );
      const ext = outputFormat === "png" ? "png" : "jpg";
      downloadBlob(blob, withExtension(image.filename, ext));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Preview area */}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-3 sm:p-4">
        {preview === "side-by-side" ? (
          <div className="flex h-full w-full items-center justify-center gap-3">
            <PreviewCard
              label="Before"
              url={image.originalUrl}
              className="flex-1"
            />
            <PreviewCard
              label="After"
              url={image.resultUrl}
              transparent
              backgroundColor={
                outputFormat === "jpeg"
                  ? resolveBgCss(image.background)
                  : "transparent"
              }
              className="flex-1"
            />
          </div>
        ) : (
          <PreviewCard
            label={preview === "before" ? "Before" : "After"}
            url={preview === "before" ? image.originalUrl : image.resultUrl}
            transparent={preview === "after"}
            backgroundColor={
              preview === "after" && outputFormat === "jpeg"
                ? resolveBgCss(image.background)
                : "transparent"
            }
            className="h-full max-h-full w-auto"
          />
        )}
      </div>

      {/* Controls bar */}
      <div className="shrink-0 border-t bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-2.5 px-3 py-2.5 sm:px-4">
          {/* Top row: preview toggle + refine */}
          <div className="flex items-center justify-between gap-2">
            <ToggleGroup
              type="single"
              value={preview}
              onValueChange={(v) => v && setPreview(v as PreviewMode)}
              variant="outline"
              size="sm"
              className="rounded-full"
            >
              <ToggleGroupItem
                value="before"
                aria-label="Before"
                className="rounded-l-full px-2.5 text-xs"
              >
                Before
              </ToggleGroupItem>
              <ToggleGroupItem
                value="side-by-side"
                aria-label="Side by side"
                className="px-2.5 text-xs"
              >
                <ArrowLeftRight className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Compare</span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="after"
                aria-label="After"
                className="rounded-r-full px-2.5 text-xs"
              >
                After
              </ToggleGroupItem>
            </ToggleGroup>

            <Button
              variant="ghost"
              size="sm"
              onClick={onRefine}
              className="h-7 gap-1.5 text-xs"
            >
              <Eraser className="h-3.5 w-3.5" />
              Refine edges
            </Button>
          </div>

          {/* Output format + background picker */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Output
            </span>
            <ToggleGroup
              type="single"
              value={outputFormat}
              onValueChange={(v) => v && setFormat(v as OutputFormat)}
              variant="outline"
              size="sm"
              className="rounded-md"
            >
              <ToggleGroupItem value="png" className="px-2.5 text-xs">
                Transparent PNG
              </ToggleGroupItem>
              <ToggleGroupItem value="jpeg" className="px-2.5 text-xs">
                JPEG + background
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {outputFormat === "jpeg" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Palette className="h-3 w-3" />
                Background
              </span>
              <ToggleGroup
                type="single"
                value={bgKind}
                onValueChange={(v) => v && setBackground(v as BackgroundChoice["kind"])}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="white" className="gap-1.5 px-2.5 text-xs">
                  <span className="h-3 w-3 rounded-sm border bg-white" />
                  White
                </ToggleGroupItem>
                <ToggleGroupItem value="black" className="gap-1.5 px-2.5 text-xs">
                  <span className="h-3 w-3 rounded-sm border bg-black" />
                  Black
                </ToggleGroupItem>
                <ToggleGroupItem value="custom" className="gap-1.5 px-2.5 text-xs">
                  <span
                    className="h-3 w-3 rounded-sm border"
                    style={{ backgroundColor: customColor }}
                  />
                  Custom
                </ToggleGroupItem>
              </ToggleGroup>
              {bgKind === "custom" && (
                <label className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
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
              )}
            </div>
          )}

          {/* Action row */}
          <div className="flex items-center gap-2 pt-0.5">
            <Button
              size="sm"
              onClick={handleDownload}
              disabled={exporting}
              className="h-9 flex-1 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {exporting ? (
                <Check className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {exporting
                ? "Preparing…"
                : `Download ${outputFormat === "png" ? "PNG" : "JPEG"}`}
            </Button>
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

function resolveBgCss(bg: BackgroundChoice): string {
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
