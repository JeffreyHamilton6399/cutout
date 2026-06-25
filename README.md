<p align="center">
  <img src="public/favicon.svg" width="120" alt="Cutout" />
</p>

<h1 align="center">Cutout</h1>

<p align="center">Remove image backgrounds instantly, in your browser. Your photos never leave your device.</p>

---

## Your photos never leave your device.

Cutout runs entirely in your browser. There is no upload endpoint. There is no
backend, no database, no API server, and no analytics. When you drop an image
into Cutout, it is decoded, processed, and composited on your own machine.

This is the opposite of services like Remove.bg, which transmit every uploaded
photo to their servers for processing. With Cutout, your photos stay where they
are: on your device.

The single network request Cutout ever makes is a one-time download of the
background-removal model (~40MB) from a CDN on first use. After that, the
browser caches the model and Cutout works fully offline. Your image pixels are
never sent over the network.

## Features

- Instant AI background removal, fully in-browser
- Before / after / side-by-side preview
- Export as transparent PNG, or JPEG with a custom background color
- Batch mode (two images processed at a time)
- Manual refine tool with eraser and restore brushes
- Custom background color picker
- Dark and light mode
- Works offline after the first model download
- Mobile-friendly, large touch targets
- HEIC support (lazy-loaded decoder)

## Tech stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS 4
- shadcn/ui (New York style)
- @imgly/background-removal (WebAssembly, in-browser inference)
- heic2any (lazy-loaded HEIC decoder)
- bun (package manager)

100% client-side. No backend, no database, no API routes, no analytics, no
tracking, no accounts, no sign-up, no paid tier, no watermarks.

## Local development

Requires Node 18+ and [bun](https://bun.sh).

```bash
bun install
bun run dev      # starts on http://localhost:3000
bun run lint
bun run build
```

## Deploy to Vercel

1. Push the project to GitHub at `JeffreyHamilton6399/cutout`.
2. Go to [vercel.com](https://vercel.com) and import the repository.
3. No environment variables are needed. The app is fully client-side.
4. The default build command `next build` is correct; output is handled
   automatically by Vercel's Next.js preset.
5. Click Deploy.

That is the entire setup. There is nothing to configure on the server because
there is no server code.

## How it works

1. You drop an image onto the dropzone. Cutout reads the file into memory
   locally. If it is a HEIC file, the heic2any decoder is loaded on demand to
   convert it to a bitmap.

2. On first use, Cutout lazy-loads the @imgly/background-removal model from a
   CDN. This is a ~40MB WebAssembly bundle. After the first download, the
   browser caches it, so subsequent loads (and offline use) skip the network
   entirely.

3. The model runs inference on the image directly inside your browser, using
   WebAssembly. No image data ever leaves your machine. You see a scanning
   progress indicator and a stage label while it works.

4. Cutout returns a transparent PNG. If you choose a JPEG with a background
   color, the transparent pixels are composited onto that color using
   OffscreenCanvas (with a canvas fallback). The result is offered for download
   as a local file. There are zero server roundtrips for your image.

## Self-hosting

The strongest privacy guarantee is self-hosting. Clone the repository, run
`bun install`, then `bun run build`. Serve the built output from any static
host or Node-capable server. No environment variables are required, because
nothing in the app talks to a server.

## Privacy Policy and Terms

Cutout ships with an in-app Privacy Policy and Terms of Service. They are
reachable from the Settings menu in the top-right corner of the app, and they
are also shown on first run before you enter the app.

## Donate

Cutout is free, open source, and will never have a paid tier. If you would like
to support development, you can buy Jeffrey a coffee:
<https://www.buymeacoffee.com/jeffreyscof>. Voluntary, no obligation.

## License

MIT License

Copyright (c) Jeffrey Hamilton

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
