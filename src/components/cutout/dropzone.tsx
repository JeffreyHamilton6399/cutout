"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImagePlus, Lock } from "lucide-react";
import {
  ACCEPT_ATTR,
  isAcceptedFile,
  MAX_FILE_BYTES,
  formatBytes,
} from "@/lib/image-utils";

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  /** Error message to show (e.g. unsupported type / too large). */
  error?: string | null;
  onErrorClear?: () => void;
}

/**
 * Empty-state dropzone. Big dashed target, paste-from-clipboard support,
 * explicit privacy copy. Mobile-first: works at 390px.
 */
export function Dropzone({ onFiles, error, onErrorClear }: DropzoneProps) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dragDepth = React.useRef(0);

  const handleFiles = React.useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const accepted = Array.from(fileList).filter(isAcceptedFile);
      if (accepted.length === 0) {
        return;
      }
      onFiles(accepted);
    },
    [onFiles],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  };

  const onPaste = React.useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.files;
      if (items && items.length > 0) {
        handleFiles(items);
      }
    },
    [handleFiles],
  );

  React.useEffect(() => {
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onPaste]);

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          className={cn(
            "group relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors sm:min-h-[340px]",
            dragging
              ? "border-emerald-500 bg-emerald-500/5"
              : "border-border hover:border-emerald-500/50 hover:bg-muted/40",
          )}
        >
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full border transition-colors",
              dragging
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-border text-muted-foreground group-hover:border-emerald-500/50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400",
            )}
          >
            <ImagePlus className="h-5 w-5" />
          </div>

          <p className="text-base font-semibold sm:text-lg">Drop a photo</p>

          <p className="text-[11px] text-muted-foreground">
            or paste from clipboard · PNG, JPEG, WebP, HEIC · max{" "}
            {formatBytes(MAX_FILE_BYTES)}
          </p>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              // reset so picking the same file again re-fires change
              e.target.value = "";
            }}
          />
        </div>

        {error && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">
            <span>{error}</span>
            {onErrorClear && (
              <button
                onClick={onErrorClear}
                className="shrink-0 underline-offset-2 hover:underline"
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span>
            Remove.bg uploads your photos to their servers. We don&apos;t — the
            AI runs entirely in your browser.
          </span>
        </div>
      </div>
    </div>
  );
}
