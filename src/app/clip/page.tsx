import type { Metadata } from "next";
import Link from "next/link";
import ClipLandingClient from "./clip-landing-client";

export const metadata: Metadata = {
  title: "Global Web Clipboard | Swoshboard - Instant Cross-Device Text Sharing",
  description:
    "Instant internet clipboard inspired by cl1p.net. Type any URL to create or view a shared clipboard from your PC, phone, or tablet with QR code support.",
  keywords: [
    "global clipboard",
    "cl1p",
    "cl1p.net alternative",
    "web clipboard",
    "cross device clipboard",
    "share text pc to phone",
    "online scratchpad",
    "temporary pastebin",
  ],
  openGraph: {
    title: "Global Web Clipboard - Swoshboard",
    description: "Instant cross-device clipboard. Share code and text between PC and mobile via custom URL or QR code.",
    type: "website",
  },
};

export default function ClipLandingPage() {
  return (
    <div className="clip-landing-page">
      <header className="clip-landing-header">
        <div className="clip-nav-inner">
          <Link href="/" className="logo">
            <span className="logo-icon">📋</span>
            <span className="logo-text">Swoshboard <span className="logo-sub">Clip</span></span>
          </Link>
          <div className="clip-nav-links">
            <Link href="/dashboard" className="btn btn-secondary btn-sm">
              Dashboard
            </Link>
            <Link href="/login" className="btn btn-primary btn-sm">
              Sign In
            </Link>
          </div>
        </div>
      </header>

      <main className="clip-landing-main">
        <ClipLandingClient />
      </main>

      <footer className="clip-landing-footer">
        <p>Swoshboard Global Web Clipboard • Fast, private, cross-device copy &amp; paste.</p>
        <p className="footer-sub">
          Inspired by cl1p.net. Powered by <Link href="/dashboard">Swoshboard</Link>.
        </p>
      </footer>
    </div>
  );
}
