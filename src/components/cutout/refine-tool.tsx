"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Eraser,
  Brush,
  Undo2,
  Check,
  X,
  RotateCcw,
} from "lucide-react";
import type { BackgroundChoice } from "@/types/cutout";

interface RefineToolProps {
  /** Raw transparent PNG blob to refine. */
  transparentPng: Blob;
  /** Dimensions of the image (for canvas). */
  width: number;
  height: number;
  /** Background the user picked (used only to render the live preview). */
  background: BackgroundChoice;
  onCancel: () => void;
  /** Called with the new refined transparent PNG blob. */
  onApply: (blob: Blob) => void;
}

type BrushMode = "erase" | "restore";

/**
 * Manual refine tool. Lets the user paint over the AI result to erase areas
 * that should be transparent, or restore areas that should be opaque.
 *
 * Implementation:
 *  - Draw the source PNG into a hidden canvas to read pixel alpha.
 *  - Maintain a mask canvas (1 channel, drawn as black/white) the user paints on.
 *  - On apply, multiply source alpha by mask to produce a new transparent PNG.
 *
 * For simplicity and performance we render the mask at the image's natural
 * resolution and use destination-in / destination-out compositing.
 */
export function RefineTool({
  transparentPng,
  width,
  height,
  background,
  onCancel,
  onApply,
}: RefineToolProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const displayCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const sourceCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const undoStackRef = React.useRef<ImageData[]>([]);
  const drawingRef = React.useRef(false);
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);

  const [brushMode, setBrushMode] = React.useState<BrushMode>("erase");
  const [brushSize, setBrushSize] = React.useState(36);
  const [canUndo, setCanUndo] = React.useState(false);

  // Display dimensions (scaled to fit container, preserving aspect ratio).
  const [displaySize, setDisplaySize] = React.useState<{
    w: number;
    h: number;
    scale: number;
  }>({ w: width, h: height, scale: 1 });

  // ---- Render the display canvas (checkerboard + source * mask) ----
  const renderDisplay = React.useCallback(() => {
    const display = displayCanvasRef.current;
    const src = sourceCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!display || !src || !mask) return;

    display.width = src.width;
    display.height = src.height;
    const ctx = display.getContext("2d")!;

    // Draw source, then mask via destination-in so only masked areas remain.
    ctx.clearRect(0, 0, display.width, display.height);
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }, []);

  // ---- Setup: load source PNG into an offscreen canvas + init mask ----
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const bitmap = await createImageBitmap(transparentPng);
      if (cancelled) {
        bitmap.close?.();
        return;
      }
      const src = document.createElement("canvas");
      src.width = bitmap.width;
      src.height = bitmap.height;
      const sctx = src.getContext("2d")!;
      sctx.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      sourceCanvasRef.current = src;

      const mask = document.createElement("canvas");
      mask.width = src.width;
      mask.height = src.height;
      const mctx = mask.getContext("2d")!;
      // The mask uses the ALPHA channel as the keep/erase value (255 = keep,
      // 0 = erase). This is what `destination-in` reads during compositing,
      // so the brush strokes (which paint alpha 0 or 255) actually take
      // effect. RGB are irrelevant for compositing; we set them to white for
      // a clean visual if the mask is ever drawn directly.
      mctx.fillStyle = "#ffffff";
      mctx.fillRect(0, 0, mask.width, mask.height);
      // Seed the mask alpha from the source PNG alpha.
      const srcData = sctx.getImageData(0, 0, src.width, src.height);
      const maskData = mctx.getImageData(0, 0, mask.width, mask.height);
      for (let i = 0; i < srcData.data.length; i += 4) {
        // mask RGB stays white; mask alpha mirrors source alpha.
        maskData.data[i] = 255;
        maskData.data[i + 1] = 255;
        maskData.data[i + 2] = 255;
        maskData.data[i + 3] = srcData.data[i + 3];
      }
      mctx.putImageData(maskData, 0, 0);
      maskCanvasRef.current = mask;

      renderDisplay();
    })();
    return () => {
      cancelled = true;
    };
  }, [transparentPng, renderDisplay]);

  // ---- Resize observer to compute display scale ----
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const maxW = el.clientWidth - 8;
      const maxH = el.clientHeight - 8;
      const scale = Math.min(maxW / width, maxH / height, 1);
      setDisplaySize({
        w: Math.round(width * scale),
        h: Math.round(height * scale),
        scale,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  // ---- Brush painting ----
  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = displayCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const pushUndo = () => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d")!;
    undoStackRef.current.push(ctx.getImageData(0, 0, mask.width, mask.height));
    if (undoStackRef.current.length > 30) undoStackRef.current.shift();
    setCanUndo(true);
  };

  const paintAt = (x: number, y: number) => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d")!;
    // Paint with alpha: erase = transparent (alpha 0), restore = opaque white
    // (alpha 255). `destination-out` removes alpha; `source-over` with opaque
    // white restores it. RGB is white in both cases; only alpha matters for
    // the final destination-in composite.
    if (brushMode === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ffffff";
    }
    const radius = brushSize / 2 / displaySize.scale;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    // Smooth line to previous point
    const last = lastPointRef.current;
    if (last) {
      ctx.lineWidth = brushSize / displaySize.scale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    // Reset composite mode so other draws aren't affected.
    ctx.globalCompositeOperation = "source-over";
    lastPointRef.current = { x, y };
    renderDisplay();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    pushUndo();
    lastPointRef.current = null;
    const p = getCanvasPoint(e);
    paintAt(p.x, p.y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const p = getCanvasPoint(e);
    paintAt(p.x, p.y);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastPointRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleUndo = () => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    mask.getContext("2d")!.putImageData(prev, 0, 0);
    renderDisplay();
    setCanUndo(undoStackRef.current.length > 0);
  };

  const handleReset = () => {
    const src = sourceCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!src || !mask) return;
    pushUndo();
    const sctx = src.getContext("2d")!;
    const mctx = mask.getContext("2d")!;
    // Re-seed mask alpha from the original source alpha.
    const srcData = sctx.getImageData(0, 0, src.width, src.height);
    const maskData = mctx.getImageData(0, 0, mask.width, mask.height);
    for (let i = 0; i < srcData.data.length; i += 4) {
      maskData.data[i] = 255;
      maskData.data[i + 1] = 255;
      maskData.data[i + 2] = 255;
      maskData.data[i + 3] = srcData.data[i + 3];
    }
    mctx.putImageData(maskData, 0, 0);
    renderDisplay();
  };

  const handleApply = async () => {
    const src = sourceCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!src || !mask) return;
    const out = document.createElement("canvas");
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob((b) => resolve(b), "image/png"),
    );
    if (blob) onApply(blob);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Canvas area */}
      <div
        ref={containerRef}
        className="checkerboard relative flex flex-1 items-center justify-center overflow-hidden p-3"
      >
        <canvas
          ref={displayCanvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            width: displaySize.w,
            height: displaySize.h,
            touchAction: "none",
            cursor: "crosshair",
          }}
          className="rounded-md border object-contain shadow-sm"
        />
      </div>

      {/* Toolbar */}
      <div className="shrink-0 border-t bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-2.5 px-3 py-2.5 sm:px-4">
          <div className="flex items-center justify-between gap-2">
            <ToggleGroup
              type="single"
              value={brushMode}
              onValueChange={(v) => v && setBrushMode(v as BrushMode)}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="erase" className="gap-1.5 px-2.5 text-xs">
                <Eraser className="h-3.5 w-3.5" />
                Erase
              </ToggleGroupItem>
              <ToggleGroupItem value="restore" className="gap-1.5 px-2.5 text-xs">
                <Brush className="h-3.5 w-3.5" />
                Restore
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUndo}
                disabled={!canUndo}
                className="h-7 gap-1.5 text-xs"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-7 gap-1.5 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            </div>
          </div>

          {/* Brush size */}
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Brush
            </span>
            <Slider
              value={[brushSize]}
              onValueChange={(v) => setBrushSize(v[0])}
              min={8}
              max={120}
              step={2}
              className="flex-1"
            />
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {brushSize}px
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-0.5">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="h-9 gap-1.5"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              className="h-9 flex-1 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Check className="h-4 w-4" />
              Apply refine
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
