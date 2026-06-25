"use client";

import * as React from "react";
import type { LegalSection } from "@/lib/legal-content";

/**
 * Renders a list of legal sections inside a constrained scrollable area.
 * Used by both the Privacy Policy and Terms of Service dialogs.
 *
 * Uses a plain overflow div (not Radix ScrollArea) so the height constraint
 * is reliably enforced and never overlaps content below it.
 */
export function LegalDocument({ sections }: { sections: LegalSection[] }) {
  return (
    <div className="cutout-scroll max-h-[45vh] overflow-y-auto pr-3">
      <div className="space-y-5 text-sm leading-relaxed">
        {sections.map((section) => (
          <section key={section.heading} className="space-y-2">
            <h3 className="font-semibold text-foreground">{section.heading}</h3>
            {section.body.map((para, i) => (
              <p key={i} className="text-muted-foreground">
                {para}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
