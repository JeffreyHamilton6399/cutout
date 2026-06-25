import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/cutout/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cutout — Remove image backgrounds in your browser",
  description:
    "Cutout removes image backgrounds instantly, in your browser. Your photos never leave your device. No uploads, no sign-up, no $40/month subscription.",
  keywords: [
    "background remover",
    "remove background",
    "transparent png",
    "in-browser AI",
    "privacy",
    "cutout",
  ],
  authors: [{ name: "Jeffrey Hamilton" }],
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Cutout — Remove image backgrounds in your browser",
    description:
      "Your photos never leave your device. No uploads, no sign-up, no $40/month.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Cutout — in-browser background removal",
    description: "Your photos never leave your device.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
