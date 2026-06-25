"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Settings,
  Heart,
  Sun,
  Moon,
  ShieldCheck,
  FileText,
  Github,
  Scissors,
} from "lucide-react";
import { DonateDialog } from "./donate-dialog";
import { LegalDialog } from "./legal-dialog";

interface HeaderProps {
  /** Called when the user clicks the Cutout logo — resets the app to the
   * empty dropzone (cancels in-flight work, revokes blob URLs). */
  onReset?: () => void;
}

/**
 * App header. Matches the reference screenshot:
 *  - Left: Cutout logo (scissors SVG + wordmark) — click to start over
 *  - Right: Donate (rose heart) + Settings gear dropdown
 *  - Dropdown contents:
 *      Light mode toggle
 *      ── Legal ──
 *      Privacy Policy
 *      Terms of Service
 *      GitHub
 */
export function Header({ onReset }: HeaderProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [donateOpen, setDonateOpen] = React.useState(false);
  const [legalOpen, setLegalOpen] = React.useState<null | "privacy" | "terms">(null);

  React.useEffect(() => setMounted(true), []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const toggleTheme = () => {
    // Toggle between dark and light explicitly (skip "system" in the toggle
    // so the switch is deterministic).
    setTheme(isDark ? "light" : "dark");
  };

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

        {/* Right actions */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDonateOpen(true)}
            className="h-7 gap-1.5 rounded-full border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
          >
            <Heart className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Donate</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 rounded-lg p-1.5"
              sideOffset={6}
            >
              {/* Light mode toggle */}
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  toggleTheme();
                }}
                className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm"
              >
                <span className="flex items-center gap-2">
                  {isDark ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                  {isDark ? "Light mode" : "Dark mode"}
                </span>
              </DropdownMenuItem>

              <DropdownMenuLabel className="px-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Legal
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-1" />

              <DropdownMenuItem
                onSelect={() => setLegalOpen("privacy")}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              >
                <ShieldCheck className="h-4 w-4" />
                Privacy Policy
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setLegalOpen("terms")}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              >
                <FileText className="h-4 w-4" />
                Terms of Service
              </DropdownMenuItem>

              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                asChild
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              >
                <a
                  href="https://github.com/JeffreyHamilton6399"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="h-4 w-4" />
                  GitHub
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <DonateDialog open={donateOpen} onOpenChange={setDonateOpen} />
      <LegalDialog
        open={legalOpen !== null}
        onOpenChange={(o) => !o && setLegalOpen(null)}
        kind={legalOpen ?? "privacy"}
      />
    </>
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
