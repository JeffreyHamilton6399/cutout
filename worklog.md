# Cutout — Worklog

Project: Cutout — in-browser background removal tool (client-side only).
Author: Jeffrey Hamilton (JeffreyHamilton6399)

Reference UI: `/home/z/my-project/upload/Capture.PNG` — dark theme, top-right Settings dropdown containing: Light mode toggle, Legal section (Privacy Policy, Terms of Service), GitHub link. Donate button (rose heart) beside settings gear.

Key user requirements (beyond master prompt):
- Top-right settings dropdown must match the reference screenshot.
- First-time visitors MUST see Terms of Service + Privacy Policy acceptance dialog before entering the app.

---
Task ID: 0
Agent: main
Task: Bootstrap — analyze reference UI, scaffold todos, install deps.

Work Log:
- Analyzed Capture.PNG via VLM — confirmed dark minimal layout, top-right dropdown structure, donate heart button, footer "V1 · Jeffrey Hamilton".
- Created this worklog.
- Starting Task 1: install @imgly/background-removal + heic2any, update next.config.ts, create scissors favicon/logo.

---
Task ID: 1-8
Agent: main
Task: Build the entire Cutout app (config, libs, dialogs, header, dropzone, processing, result, batch, refine, page wiring).

Work Log:
- Installed @imgly/background-removal@1.7.0 + heic2any@0.0.4.
- Removed `output: "standalone"` and unsupported `eslint` key from next.config.ts; kept ignoreBuildErrors.
- Created public/favicon.svg (scissors mark) + public/logo.svg (wordmark).
- src/types/cutout.ts — shared types (CutoutImage, ProgressInfo, BackgroundChoice, OutputFormat, AppSettings).
- src/lib/background-removal.ts — lazy dynamic-import wrapper around @imgly/background-removal with progress → stage-label mapping + preload helper.
- src/lib/image-utils.ts — HEIC decode (heic2any lazy), normalizeForProcessing, readDimensions, exportWithBackground (OffscreenCanvas with canvas fallback), downloadBlob, downloadAll, sanitizers, formatBytes, ACCEPT_ATTR, MAX_FILE_BYTES (10MB).
- src/lib/concurrency.ts — runWithConcurrency (batch, max 2 in flight).
- src/lib/terms-storage.ts — useAppSettings hook (localStorage: theme + termsAccepted), acceptTerms, resetTerms.
- src/lib/legal-content.ts — full Privacy Policy + Terms of Service section text + one-line summaries.
- src/components/cutout/theme-provider.tsx — next-themes class strategy.
- src/components/cutout/legal-document.tsx — scrollable legal section renderer.
- src/components/cutout/terms-acceptance-dialog.tsx — FIRST-RUN GATE: tabbed Overview/Privacy/Terms + two required consent checkboxes + "Enter Cutout" (disabled until both checked). Matches user requirement.
- src/components/cutout/legal-dialog.tsx — read-only Privacy Policy / Terms of Service dialog opened from Settings menu.
- src/components/cutout/donate-dialog.tsx — Buy Me a Coffee (https://www.buymeacoffee.com/jeffreyscof).
- src/components/cutout/header.tsx — REFERENCE UI MATCH: logo + rose "Donate" heart button + Settings gear dropdown containing Light mode toggle, "Legal" label, Privacy Policy, Terms of Service, GitHub link.
- src/components/cutout/dropzone.tsx — dashed dropzone, paste-from-clipboard, privacy badges, 10MB/type error states.
- src/components/cutout/processing-view.tsx — original image + scanning-line animation + progress bar + stage label (no spinner per design).
- src/components/cutout/result-view.tsx — before/after/side-by-side toggle, checkerboard preview, Transparent PNG / JPEG+background toggle, White/Black/Custom color picker, Download (emerald), New file (icon), Refine edges (ghost).
- src/components/cutout/batch-view.tsx — scrollable rows (thumb before→after, filename, dims, size, status, progress, download), Add + Download all, concurrency 2 via parent.
- src/components/cutout/refine-tool.tsx — canvas mask painting, Erase/Restore brushes, brush size slider, Undo/Reset/Apply; composites mask via destination-in; outputs refined transparent PNG.
- src/app/page.tsx — orchestrator: empty/processing/result/batch/refine state machine, single-vs-batch routing, blob-URL lifecycle + abort cleanup, terms gate.
- src/app/layout.tsx — Cutout metadata + favicon + ThemeProvider + viewport (h-dvh friendly).
- src/app/globals.css — .checkerboard (conic-gradient, light+dark), .cutout-scroll custom scrollbar, color-input chrome reset.
- Lint clean (0 errors, 0 warnings). Dev server compiles, GET / 200.

Stage Summary:
- Full client-side app built. Single route `/`. First-run terms gate enforced. Reference top-right dropdown implemented. All design rules honored (no gradients/blobs/spinners, emerald=download, amber=model, rose=donate, min 28px touch targets, h-dvh no page scroll, sticky footer).

---
Task ID: 10
Agent: README-writer
Task: Write /home/z/my-project/README.md for the Cutout project.

Work Log:
- Read worklog.md to confirm the full component/lib inventory built in Tasks 0-8 (client-side only, @imgly/background-removal WASM, first-run terms gate, top-right settings dropdown, batch/refine/export features, etc.).
- Verified /public/favicon.svg and /public/logo.svg exist for the small flat logo img reference at the top of the README.
- Wrote /home/z/my-project/README.md (136 lines, under the 250-line budget) with the 11 required sections in order:
  1. Title + tagline with centered favicon.svg img (width 120).
  2. "Your photos never leave your device." privacy-promise hero section contrasting Remove.bg and naming the one-time ~40MB model CDN download.
  3. Features bullet list (instant removal, before/after preview, transparent PNG or JPEG w/ background, batch 2-at-a-time, manual refine eraser/restore, custom bg color, dark/light, offline after first load, mobile-friendly, HEIC).
  4. Tech stack compact list (Next.js 16 App Router, TS, Tailwind 4, shadcn/ui New York, @imgly/background-removal WASM, heic2any, bun) plus the 100% client-side guarantees line.
  5. Local development with bun install / dev (port 3000) / lint / build, Node 18+ + bun note.
  6. Deploy to Vercel step-by-step (repo JeffreyHamilton6399/cutout, import on vercel.com, no env vars, default next build, deploy).
  7. How it works (4 short paragraphs: drop + optional HEIC decode -> lazy-load ~40MB WASM model cached by browser -> in-browser WASM inference -> transparent PNG, optional OffscreenCanvas JPEG compositing; zero image roundtrips).
  8. Self-hosting paragraph (clone, bun install, bun run build, serve static, no env vars).
  9. Privacy Policy & Terms (in-app, Settings menu top-right, shown on first run).
  10. Donate one-liner to https://www.buymeacoffee.com/jeffreyscof, no paid tier ever.
  11. License: MIT, copyright Jeffrey Hamilton (full MIT text).
- Style: no emoji, no decorative banners beyond the small favicon img, flat/professional tone, short paragraphs, ```bash fenced blocks for commands.

Stage Summary:
- README.md complete at /home/z/my-project/README.md. All required sections present in order, all project facts used verbatim, no invented details. Privacy promise is the hero section. File is 136 lines. Appended this worklog section without overwriting prior content.

---
Task ID: 9
Agent: main
Task: Self-verify Cutout with Agent Browser (terms flow, dropzone, result, responsiveness, sticky footer, settings dropdown).

Work Log:
- Verified first-run Terms/Privacy gate renders on first visit: "Before you start" dialog with Overview/Privacy Policy/Terms of Service tabs + two consent checkboxes + disabled "Enter Cutout".
- Fixed a layout bug: legal ScrollArea overflowed and covered the consent checkboxes. Switched LegalDocument to a constrained `max-h-[45vh] overflow-y-auto` div, made DialogContent `flex max-h-[90vh] flex-col`, replaced custom sr-only checkbox with shadcn Checkbox for reliable clicking.
- Verified acceptance flow: checking both consent boxes enables "Enter Cutout"; clicking it reveals the dropzone.
- Verified header matches reference: Cutout scissors logo + rose "Donate" heart + Settings gear.
- Verified Settings dropdown matches Capture.PNG exactly: Dark/Light mode toggle, "LEGAL" label, Privacy Policy (shield), Terms of Service (document), GitHub (git).
- Verified dark mode toggle works (html class flips to "dark").
- Verified Privacy Policy + Terms of Service dialogs open from Settings menu with full legal text.
- Verified mobile responsiveness at 390×844: no horizontal scroll, compact header (Donate icon-only), centered dropzone, footer stuck to bottom.
- Verified end-to-end background removal: uploaded a test PNG → WASM model loaded (@imgly/background-removal ran single-threaded) → processing view with scanning animation + progress → result view with before/after + checkerboard transparency (background actually removed).
- Verified result controls: Transparent PNG / JPEG+background toggle, White/Black/Custom background picker (appears only for JPEG), Download PNG (emerald) → Download JPEG, New file, Refine edges.
- Verified footer "V1 · Jeffrey Hamilton" sticky at bottom on both desktop and mobile.
- No browser errors, no console errors, clean dev log (200s only). Lint: 0 errors, 0 warnings.

Stage Summary:
- Cutout is fully functional and browser-verified. All user requirements met: reference top-right settings dropdown replicated, first-run terms/privacy gate enforced, end-to-end in-browser background removal works, mobile-responsive, sticky footer, dark/light mode. Privacy guarantee holds (100% client-side, only network request is one-time 40MB model CDN download).
