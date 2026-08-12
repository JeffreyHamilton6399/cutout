"use client";

import * as React from "react";
import { Check, Heart, Scissors, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FeedbackButton } from "@/components/feedback-button";
import { SiteSettingsMenu } from "@/components/site-settings-menu";
import { DonateDialog } from "./donate-dialog";
import type { ModelQuality } from "@/types/cutout";

interface HeaderProps {
  /** Called when the user clicks the Cutout logo — resets the app to the
   * empty dropzone (cancels in-flight work, revokes blob URLs). */
  onReset?: () => void;
  /** Current AI model quality. */
  quality?: ModelQuality;
  /** Called when the user changes the model quality. */
  onQualityChange?: (q: ModelQuality) => void;
}

/**
 * App header. Chrome (gear menu, legal dialogs, GitHub link) comes from the
 * shared SiteSettingsMenu; Cutout's own model-quality setting is injected
 * into it as children so it sits under the theme toggle.
 */
export function Header({ onReset, quality = "standard", onQualityChange }: HeaderProps) {
  const [donateOpen, setDonateOpen] = React.useState(false);

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-3 sm:px-4">
        {/* Logo — click to start over (resets to the dropzone) */}
        <button
          type="button"
          onClick={onReset}
          title="Start over"
          aria-label="Cutout — start over"
          className="group flex items-center gap-2 rounded-md px-1 py-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ScissorsLogo />
          <span className="text-sm font-semibold tracking-tight transition-colors group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
            Cutout
          </span>
        </button>

        <div className="flex items-center gap-1.5">
          <FeedbackButton />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDonateOpen(true)}
            className="h-7 gap-1.5 rounded-full border-rose-200 px-3 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
          >
            <Heart className="size-3.5" />
            <span className="hidden sm:inline">Donate</span>
          </Button>

          <SiteSettingsMenu>
            <QualityItem
              value="standard"
              current={quality}
              label="Standard"
              hint="~44MB · fast · best for most photos"
              onSelect={onQualityChange}
            />
            <QualityItem
              value="maximum"
              current={quality}
              label="Maximum"
              hint="~176MB · best for dark subjects & hair"
              onSelect={onQualityChange}
            />
          </SiteSettingsMenu>
        </div>
      </header>

      <DonateDialog open={donateOpen} onOpenChange={setDonateOpen} />
    </>
  );
}

/** One model-quality row. preventDefault keeps the menu open so the
 * checkmark updates in place. */
function QualityItem({
  value,
  current,
  label,
  hint,
  onSelect,
}: {
  value: ModelQuality;
  current: ModelQuality;
  label: string;
  hint: string;
  onSelect?: (q: ModelQuality) => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        onSelect?.(value);
      }}
      className="flex cursor-pointer items-start gap-2"
    >
      <Sparkles className="mt-0.5 size-4 shrink-0" />
      <span className="flex flex-col">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {label}
          {current === value && (
            <Check className="size-3.5 text-emerald-600" />
          )}
        </span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </DropdownMenuItem>
  );
}

/** Flat scissors mark — the Cutout logo. */
function ScissorsLogo() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
      <Scissors className="h-4 w-4" />
    </span>
  );
}
