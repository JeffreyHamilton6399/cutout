"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Heart, ExternalLink, Coffee } from "lucide-react";

interface DonateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DONATE_URL = "https://www.buymeacoffee.com/jeffreyscof";

export function DonateDialog({ open, onOpenChange }: DonateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 sm:rounded-xl">
        <div className="flex flex-col items-center gap-3 px-6 pb-2 pt-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
            <Heart className="h-6 w-6" />
          </div>
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="text-base font-semibold">
              Buy Jeffrey a coffee
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cutout is free, open-source, and will stay that way. If it saved
              you a $40/month subscription, a coffee helps keep it running.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-2 px-6 py-5">
          <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            No account required. No premium tier. No watermarks. Donations are
            voluntary and grant nothing except good karma.
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button
            size="sm"
            asChild
            className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700"
          >
            <a href={DONATE_URL} target="_blank" rel="noopener noreferrer">
              <Coffee className="h-4 w-4" />
              Buy me a coffee
              <ExternalLink className="h-3 w-3 opacity-70" />
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
