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
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck, FileText, Lock } from "lucide-react";
import {
  PRIVACY_POLICY_SECTIONS,
  TERMS_OF_SERVICE_SECTIONS,
  PRIVACY_SUMMARY,
  TERMS_SUMMARY,
} from "@/lib/legal-content";
import { LegalDocument } from "./legal-document";

interface TermsAcceptanceDialogProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

type Tab = "overview" | "privacy" | "terms";

/**
 * First-run gate. Shown before the user can use the app. The user must
 * explicitly accept both the Privacy Policy and Terms of Service to enter.
 *
 * Design: clean two-column layout on desktop (overview + tabbed legal),
 * stacked on mobile. Accept button is disabled until the user has viewed
 * both legal tabs (we track "viewed" by switching to each tab at least once,
 * or they can just click the checkboxes).
 */
export function TermsAcceptanceDialog({
  open,
  onAccept,
  onDecline,
}: TermsAcceptanceDialogProps) {
  const [tab, setTab] = React.useState<Tab>("overview");
  const [acceptedPrivacy, setAcceptedPrivacy] = React.useState(false);
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);

  // Reset acceptance state whenever the dialog re-opens.
  React.useEffect(() => {
    if (open) {
      setTab("overview");
      setAcceptedPrivacy(false);
      setAcceptedTerms(false);
    }
  }, [open]);

  const canProceed = acceptedPrivacy && acceptedTerms;

  return (
    <Dialog open={open} onOpenChange={() => onDecline()}>
      <DialogContent
        className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl"
        showCloseButton={false}
      >
        {/* Header band */}
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold">
              Before you start
            </DialogTitle>
            <DialogDescription className="text-xs">
              A 20-second read about your privacy.
            </DialogDescription>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b px-4 pt-3">
          <TabButton
            active={tab === "overview"}
            onClick={() => setTab("overview")}
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            label="Overview"
          />
          <TabButton
            active={tab === "privacy"}
            onClick={() => setTab("privacy")}
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            label="Privacy Policy"
          />
          <TabButton
            active={tab === "terms"}
            onClick={() => setTab("terms")}
            icon={<FileText className="h-3.5 w-3.5" />}
            label="Terms of Service"
          />
        </div>

        <div className="cutout-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Your photos never leave your device.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {PRIVACY_SUMMARY}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">Terms, in one line</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {TERMS_SUMMARY}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Read both documents in full using the tabs above, then confirm
                below to enter Cutout.
              </p>
            </div>
          )}

          {tab === "privacy" && (
            <LegalDocument sections={PRIVACY_POLICY_SECTIONS} />
          )}

          {tab === "terms" && (
            <LegalDocument sections={TERMS_OF_SERVICE_SECTIONS} />
          )}
        </div>

        {/* Checkboxes + actions */}
        <div className="space-y-4 border-t px-6 py-4">
          <div className="space-y-3">
            <ConsentRow
              checked={acceptedPrivacy}
              onChange={setAcceptedPrivacy}
              label="I have read and accept the Privacy Policy."
            />
            <ConsentRow
              checked={acceptedTerms}
              onChange={setAcceptedTerms}
              label="I have read and accept the Terms of Service."
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="sm" onClick={onDecline}>
              Decline
            </Button>
            <Button
              size="sm"
              onClick={onAccept}
              disabled={!canProceed}
              className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              Enter Cutout
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "border-emerald-500 text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function ConsentRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:text-white"
      />
      <span className="text-muted-foreground">{label}</span>
    </label>
  );
}
