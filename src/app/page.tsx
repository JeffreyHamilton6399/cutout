"use client";

import * as React from "react";
import { Header } from "@/components/cutout/header";
import { Dropzone } from "@/components/cutout/dropzone";
import { ProcessingView } from "@/components/cutout/processing-view";
import { ResultView } from "@/components/cutout/result-view";
import { BatchView } from "@/components/cutout/batch-view";
import { RefineTool } from "@/components/cutout/refine-tool";
import { TermsAcceptanceDialog } from "@/components/cutout/terms-acceptance-dialog";
import type {
  AppMode,
  CutoutImage,
  ImageStatus,
  ProgressInfo,
} from "@/types/cutout";
import { useAppSettings } from "@/lib/terms-storage";
import {
  removeImageBackground,
  preloadBackgroundRemovalModel,
} from "@/lib/background-removal";
import {
  createImageUrl,
  exportWithBackground,
  downloadBlob,
  extForFormat,
  isAcceptedFile,
  MAX_FILE_BYTES,
  normalizeForProcessing,
  readDimensions,
  revokeImageUrl,
  sanitizeFilename,
  withExtension,
} from "@/lib/image-utils";
import { runWithConcurrency } from "@/lib/concurrency";

type View =
  | { kind: "empty" }
  | { kind: "processing"; imageId: string }
  | { kind: "result"; imageId: string }
  | { kind: "batch" }
  | { kind: "refine"; imageId: string };

const INITIAL_PROGRESS: ProgressInfo = { ratio: 0, label: "Starting…" };

function makeImage(file: File): CutoutImage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    originalUrl: createImageUrl(file),
    status: "queued",
    progress: INITIAL_PROGRESS,
    filename: sanitizeFilename(file.name),
    background: { kind: "none" },
    downloadFormat: "png",
  };
}

export default function Home() {
  const { settings, hydrated, acceptTerms } = useAppSettings();

  const [images, setImages] = React.useState<CutoutImage[]>([]);
  const [view, setView] = React.useState<View>({ kind: "empty" });
  const [error, setError] = React.useState<string | null>(null);

  // Keep raw transparent PNG blobs (per image) in memory for export + refine.
  const transparentPngsRef = React.useRef<Record<string, Blob>>({});
  // Track abort controllers so unmount / "new file" can cancel in-flight work.
  const abortsRef = React.useRef<Record<string, AbortController>>({});

  // ---- Cleanup on unmount ----
  React.useEffect(() => {
    return () => {
      Object.values(abortsRef.current).forEach((a) => a.abort());
      images.forEach((i) => revokeImageUrl(i.originalUrl));
      images.forEach((i) => revokeImageUrl(i.resultUrl));
    };
  }, []);

  // ---- Preload the AI model on idle once terms are accepted, so the first
  // real background removal is fast (the ~44MB download happens in the
  // background, cached by the browser for all subsequent runs).
  React.useEffect(() => {
    if (!hydrated || !settings.termsAccepted) return;
    const run = () => preloadBackgroundRemovalModel();
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const handle = (window as Window & {
        requestIdleCallback: (cb: () => void) => number;
      }).requestIdleCallback(run);
      return () =>
        (window as Window & {
          cancelIdleCallback: (h: number) => void;
        }).cancelIdleCallback(handle);
    }
    const t = window.setTimeout(run, 1500);
    return () => window.clearTimeout(t);
  }, [hydrated, settings.termsAccepted]);

  // ---- Helpers ----
  const patchImage = React.useCallback(
    (id: string, patch: Partial<CutoutImage>) => {
      setImages((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      );
    },
    [],
  );

  const processOne = React.useCallback(
    async (image: CutoutImage) => {
      const controller = new AbortController();
      abortsRef.current[image.id] = controller;

      const setStage = (status: ImageStatus, progress: ProgressInfo) =>
        patchImage(image.id, { status, progress });

      try {
        setStage("decoding", { ratio: 0.05, label: "Decoding image…" });
        const normalized = await normalizeForProcessing(image.file);
        const dims = await readDimensions(normalized).catch(() => ({
          width: 0,
          height: 0,
        }));
        patchImage(image.id, dims);

        setStage("loading-model", {
          ratio: 0.1,
          label: "Loading AI model (one-time 40MB download)",
        });

        const result = await removeImageBackground(normalized, {
          signal: controller.signal,
          onProgress: (info) => {
            // Map model stage (0.1–0.6) and inference stage (0.6–1.0).
            const isModel = info.label.toLowerCase().includes("model") ||
              info.label.toLowerCase().includes("init") ||
              info.label.toLowerCase().includes("download");
            const ratio = isModel
              ? 0.1 + info.ratio * 0.5
              : 0.6 + info.ratio * 0.4;
            patchImage(image.id, {
              status: isModel ? "loading-model" : "processing",
              progress: { ratio, label: info.label },
            });
          },
        });

        const resultUrl = createImageUrl(result);
        transparentPngsRef.current[image.id] = result;

        patchImage(image.id, {
          status: "done",
          resultUrl,
          progress: { ratio: 1, label: "Done" },
        });
      } catch (e) {
        if (controller.signal.aborted) return;
        const message =
          e instanceof Error ? e.message : "Failed to remove background";
        patchImage(image.id, {
          status: "error",
          error: message,
          progress: { ratio: 0, label: "Failed" },
        });
      } finally {
        delete abortsRef.current[image.id];
      }
    },
    [patchImage],
  );

  // ---- Entry: files dropped ----
  const handleFiles = React.useCallback(
    (files: File[]) => {
      // Validate
      const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
      if (tooBig) {
        setError(
          `"${tooBig.name}" is larger than 10MB. Try a smaller image to avoid crashes on mobile.`,
        );
        return;
      }
      const accepted = files.filter(isAcceptedFile);
      if (accepted.length === 0) {
        setError("Unsupported file type. Use PNG, JPEG, WebP, HEIC, or BMP.");
        return;
      }

      const newImages = accepted.map(makeImage);
      setImages((prev) => [...prev, ...newImages]);

      if (newImages.length === 1 && images.length === 0) {
        // Single-image flow
        setView({ kind: "processing", imageId: newImages[0].id });
        void processOne(newImages[0]).then(() => {
          setView((v) =>
            v.kind === "processing" && v.imageId === newImages[0].id
              ? { kind: "result", imageId: newImages[0].id }
              : v,
          );
        });
      } else {
        // Batch flow
        setView({ kind: "batch" });
        void runWithConcurrency(newImages, 2, (img) => processOne(img));
      }
    },
    [images.length, processOne],
  );

  // ---- Add more files in batch ----
  const handleAddMore = React.useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      "image/png,image/jpeg,image/webp,image/heic,image/heif,image/bmp,.png,.jpg,.jpeg,.webp,.heic,.heif,.bmp";
    input.multiple = true;
    input.onchange = () => {
      if (input.files && input.files.length > 0) {
        const files = Array.from(input.files);
        const valid = files.filter(
          (f) => isAcceptedFile(f) && f.size <= MAX_FILE_BYTES,
        );
        if (valid.length === 0) return;
        const newImages = valid.map(makeImage);
        setImages((prev) => [...prev, ...newImages]);
        void runWithConcurrency(newImages, 2, (img) => processOne(img));
      }
    };
    input.click();
  }, [processOne]);

  // ---- Single result actions ----
  const handleNewFile = React.useCallback(() => {
    // Cancel any in-flight work and revoke URLs for the current single image.
    setImages((prev) => {
      prev.forEach((i) => {
        abortsRef.current[i.id]?.abort();
        revokeImageUrl(i.originalUrl);
        revokeImageUrl(i.resultUrl);
        delete transparentPngsRef.current[i.id];
      });
      return [];
    });
    setView({ kind: "empty" });
  }, []);

  const handleDownloadOne = React.useCallback(
    async (image: CutoutImage) => {
      const png = transparentPngsRef.current[image.id];
      if (!png) return;
      const blob = await exportWithBackground(
        png,
        image.downloadFormat,
        image.background,
      );
      downloadBlob(
        blob,
        withExtension(image.filename, extForFormat(image.downloadFormat)),
      );
    },
    [],
  );

  // ---- Refine ----
  const openRefine = React.useCallback((imageId: string) => {
    setView({ kind: "refine", imageId });
  }, []);

  const applyRefine = React.useCallback(
    (imageId: string, blob: Blob) => {
      const prev = transparentPngsRef.current[imageId];
      transparentPngsRef.current[imageId] = blob;
      // Refresh the result URL so previews update.
      setImages((prev) =>
        prev.map((i) => {
          if (i.id !== imageId) return i;
          if (i.resultUrl) revokeImageUrl(i.resultUrl);
          return {
            ...i,
            resultUrl: createImageUrl(blob),
            refined: true,
          };
        }),
      );
      setView({ kind: "result", imageId });
    },
    [],
  );

  // ---- Derived ----
  const currentImage =
    view.kind === "processing" || view.kind === "result" || view.kind === "refine"
      ? images.find((i) => i.id === view.imageId)
      : undefined;

  const refineImage =
    view.kind === "refine" ? images.find((i) => i.id === view.imageId) : undefined;

  const showTerms = hydrated && !settings.termsAccepted;

  // Don't render the app shell until hydrated (prevents theme flash + terms
  // dialog flicker).
  if (!hydrated) {
    return <div className="h-dvh w-screen bg-background" />;
  }

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-background">
      <Header />

      <main className="cutout-scroll flex-1 overflow-hidden">
        {view.kind === "empty" && (
          <Dropzone onFiles={handleFiles} error={error} onErrorClear={() => setError(null)} />
        )}

        {view.kind === "processing" && currentImage && (
          <ProcessingView image={currentImage} />
        )}

        {view.kind === "result" &&
          currentImage &&
          transparentPngsRef.current[currentImage.id] && (
            <ResultView
              image={currentImage}
              transparentPng={transparentPngsRef.current[currentImage.id]}
              onNewFile={handleNewFile}
              onRefine={() => openRefine(currentImage.id)}
              onUpdateImage={(patch) => patchImage(currentImage.id, patch)}
            />
          )}

        {view.kind === "batch" && (
          <BatchView
            images={images}
            transparentPngs={transparentPngsRef.current}
            onAddMore={handleAddMore}
            onDownloadOne={handleDownloadOne}
          />
        )}

        {view.kind === "refine" &&
          refineImage &&
          transparentPngsRef.current[refineImage.id] &&
          refineImage.width &&
          refineImage.height && (
            <RefineTool
              transparentPng={transparentPngsRef.current[refineImage.id]}
              width={refineImage.width}
              height={refineImage.height}
              background={refineImage.background}
              onCancel={() => setView({ kind: "result", imageId: refineImage.id })}
              onApply={(blob) => applyRefine(refineImage.id, blob)}
            />
          )}
      </main>

      <Footer />

      {/* First-run terms gate */}
      <TermsAcceptanceDialog
        open={showTerms}
        onAccept={acceptTerms}
        onDecline={() => {
          // Decline: keep the dialog open (no way to enter the app). We just
          // surface a message; the app stays locked.
        }}
      />
    </div>
  );
}

function Footer() {
  return (
    <footer className="flex h-8 shrink-0 items-center justify-center border-t px-3 text-[11px] text-muted-foreground">
      V1 · Jeffrey Hamilton
    </footer>
  );
}
