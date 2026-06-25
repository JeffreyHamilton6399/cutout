// Long-form legal copy for Cutout. Plain-text-ish markdown stored as a
// list of section headings + body paragraphs so the dialogs can render a
// clean, readable layout without pulling in a markdown renderer.

export interface LegalSection {
  heading: string;
  /** Each string is one paragraph. */
  body: string[];
}

export const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    heading: "The short version",
    body: [
      "Cutout removes image backgrounds entirely inside your browser. Your photos are never uploaded to any server. We do not run analytics, we do not track you, and we do not have a database of your images — because we never receive them.",
    ],
  },
  {
    heading: "What never leaves your device",
    body: [
      "The image you drop into Cutout, the processed result, and any edits you make with the refine brush all stay in your browser's memory. There is no upload endpoint. There is no backend. The source code is open and you can verify this yourself.",
    ],
  },
  {
    heading: "The one network request we make",
    body: [
      "On first use, Cutout downloads the AI background-removal model (~40MB) from a public CDN. This is a one-time download — the browser caches it, and subsequent removals work fully offline. The request fetches the model file only; your image is never sent with it.",
      "If your browser is online and the model is already cached, no network request is made at all during processing.",
    ],
  },
  {
    heading: "Local storage",
    body: [
      "Cutout stores two things in your browser's localStorage: your theme preference (light/dark) and a flag recording that you accepted these terms. That is everything. We do not set cookies, we do not use fingerprinting, and we do not collect device information.",
    ],
  },
  {
    heading: "Contrast with upload-based services",
    body: [
      "Services like Remove.bg upload your photos to their servers for processing. Cutout does not. The AI model runs as WebAssembly directly in your browser tab. This is slower on the first run (the model must download) but it is the only way to make a credible privacy promise.",
    ],
  },
  {
    heading: "Children's privacy",
    body: [
      "Cutout does not knowingly collect any information from anyone, including children. Because we do not collect data, this policy does not distinguish by age.",
    ],
  },
  {
    heading: "Changes to this policy",
    body: [
      "If we ever change Cutout in a way that introduces a network request carrying your image, we will update this policy and surface the change prominently before you process another photo. The current model — local-only — is the product.",
    ],
  },
  {
    heading: "Contact",
    body: [
      "Cutout is an open-source project by Jeffrey Hamilton. File issues on GitHub at JeffreyHamilton6399/cutout.",
    ],
  },
];

export const TERMS_OF_SERVICE_SECTIONS: LegalSection[] = [
  {
    heading: "Acceptance",
    body: [
      "By using Cutout, you agree to these terms. If you do not agree, do not use the tool. You accepted these terms in the first-run dialog before entering the app.",
    ],
  },
  {
    heading: "What Cutout provides",
    body: [
      "Cutout is a free, client-side tool that removes image backgrounds in your browser using an on-device AI model. It is provided as-is, at no cost, with no account, no watermark, and no paid tier.",
    ],
  },
  {
    heading: "Your content & your responsibility",
    body: [
      "You are responsible for the images you process and for ensuring you have the rights to do so. Because Cutout never receives your images, we cannot see, store, moderate, or be complicit in the content you process. All processing happens on your device.",
      "You own your input and your output. Cutout claims no rights over either.",
    ],
  },
  {
    heading: "Acceptable use",
    body: [
      "Do not use Cutout to process images in ways that are illegal in your jurisdiction, or that infringe another person's rights. Because processing is local, we cannot enforce this — but you remain responsible for what you do with the results.",
    ],
  },
  {
    heading: "No warranty",
    body: [
      "Cutout is provided \"as is\" without warranty of any kind. The AI model is a general-purpose tool and will not produce perfect results on every image. We do not guarantee that the tool will be available, error-free, or suitable for any particular purpose.",
    ],
  },
  {
    heading: "Limitation of liability",
    body: [
      "To the maximum extent permitted by law, Jeffrey Hamilton shall not be liable for any damages arising from the use of or inability to use Cutout, including any damage to images, devices, or data.",
    ],
  },
  {
    heading: "Open source",
    body: [
      "Cutout's source code is publicly available. You are welcome to inspect, fork, and self-host it under the terms of its license. Self-hosting is the strongest possible privacy guarantee.",
    ],
  },
  {
    heading: "Donations",
    body: [
      "Cutout is free and will stay free. There is an optional Donate button linking to Buy Me a Coffee. Donations are voluntary and grant no additional features — there is no paid tier and there never will be.",
    ],
  },
  {
    heading: "Changes to these terms",
    body: [
      "If these terms change, the first-run acceptance dialog will be shown again on your next visit so you can re-review. Continued use after that point constitutes acceptance of the updated terms.",
    ],
  },
];

export const PRIVACY_SUMMARY =
  "Cutout runs entirely in your browser. Your photos never leave your device. The only network request is a one-time download of the AI model (~40MB), then everything works offline.";

export const TERMS_SUMMARY =
  "Cutout is free, open-source, and client-side. You own your images. The tool is provided as-is with no warranty. You are responsible for the images you process.";
