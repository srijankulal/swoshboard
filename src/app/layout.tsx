import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://swoshboard.vercel.app"),
  title: {
    default: "Swoshboard — Personal Cloud Storage, Web Clipboard & AI Lab Studio",
    template: "%s | Swoshboard",
  },
  description:
    "Fast, personal cloud backup and web productivity suite. Features authenticated Cloudinary storage, cl1p.net-style instant cross-device web clipboard, and AI-powered CS lab studio compiler.",
  applicationName: "Swoshboard",
  keywords: [
    "swoshboard",
    "cloud storage",
    "personal backup",
    "web clipboard",
    "cl1p alternative",
    "online clipboard",
    "cross device clipboard",
    "ai lab assistant",
    "code compiler",
    "lab records generator",
    "cs lab assignments",
    "ephemeral pastebin",
  ],
  authors: [{ name: "Swoshboard", url: "https://swoshboard.vercel.app" }],
  creator: "Swoshboard",
  publisher: "Swoshboard",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Swoshboard — Personal Cloud Storage, Web Clipboard & AI Lab Studio",
    description:
      "Secure personal cloud storage, cl1p-style instant cross-device web clipboard, and AI lab records compiler.",
    url: "https://swoshboard.vercel.app",
    siteName: "Swoshboard",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Swoshboard — Personal Cloud Storage & Web Clipboard",
    description:
      "Secure personal cloud storage, cl1p-style instant cross-device web clipboard, and AI lab studio compiler.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "Productivity",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
