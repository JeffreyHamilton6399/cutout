"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ShieldCheck, FileText } from "lucide-react";
import {
  PRIVACY_POLICY_SECTIONS,
  TERMS_OF_SERVICE_SECTIONS,
} from "@/lib/legal-content";
import { LegalDocument } from "./legal-document";

interface LegalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "privacy" | "terms";
}

export function LegalDialog({ open, onOpenChange, kind }: LegalDialogProps) {
  const isPrivacy = kind === "privacy";
  const sections = isPrivacy ? PRIVACY_POLICY_SECTIONS : TERMS_OF_SERVICE_SECTIONS;
  const Icon = isPrivacy ? ShieldCheck : FileText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0 sm:rounded-xl">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold">
              {isPrivacy ? "Privacy Policy" : "Terms of Service"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {isPrivacy
                ? "How Cutout handles (or rather, doesn't handle) your photos."
                : "The rules of the road for using Cutout."}
            </DialogDescription>
          </div>
        </div>
        <div className="px-6 py-5">
          <LegalDocument sections={sections} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
