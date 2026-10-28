"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ClipLandingClient() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");

  const handleOpenClip = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!clean) {
      setError("Please enter a clip name (letters, numbers, dashes).");
      return;
    }
    router.push(`/clip/${encodeURIComponent(clean)}`);
  };

  const handleQuickClip = () => {
    const randomSlug = "clip-" + Math.random().toString(36).slice(2, 8);
    router.push(`/clip/${randomSlug}`);
  };

  return (
    <div className="clip-hero">
      <div className="clip-badge">🌐 Global Internet Clipboard</div>
      <h1 className="clip-title">
        Copy on your PC. <br />
        <span className="gradient-text">Paste on your Phone.</span>
      </h1>
      <p className="clip-subtitle">
        Access or create any clipboard URL on the internet — just like <strong>cl1p.net</strong>.
        No account required. Fast, ephemeral, with instant QR code transfer.
      </p>

      {/* Input Box */}
      <form onSubmit={handleOpenClip} className="clip-url-box">
        <div className="clip-url-prefix">swoshboard.vercel.app/clip/</div>
        <input
          type="text"
          className="clip-url-input"
          placeholder="your-custom-name"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            if (error) setError("");
          }}
          autoFocus
          spellCheck={false}
        />
        <button type="submit" className="btn btn-primary clip-go-btn">
          <span>Go to Clip</span>
          <span aria-hidden="true">→</span>
        </button>
      </form>

      {error && <div className="clip-error-banner">{error}</div>}

      <div className="clip-quick-row">
        <span>Need a clip right now?</span>
        <button
          type="button"
          onClick={handleQuickClip}
          className="btn btn-secondary btn-sm"
        >
          ⚡ Create Instant Random Clip
        </button>
      </div>

      {/* Feature Grid */}
      <div className="clip-feature-grid">
        <div className="clip-feature-card">
          <div className="feature-icon">⚡</div>
          <h3>Custom URL Access</h3>
          <p>
            Pick any easy-to-remember name like <code>/clip/lab-query</code> or <code>/clip/my-token</code>. Anyone with the URL can view or update it.
          </p>
        </div>

        <div className="clip-feature-card">
          <div className="feature-icon">📱</div>
          <h3>Scan QR to Phone</h3>
          <p>
            One-click QR code display lets your mobile camera read the URL and copy the text directly to your phone’s keyboard.
          </p>
        </div>

        <div className="clip-feature-card">
          <div className="feature-icon">🛡️</div>
          <h3>Auto-Burn & Expiry</h3>
          <p>
            Set your clip to self-destruct after 1 read, 1 hour, 24 hours, or 7 days, or lock it as read-only.
          </p>
        </div>
      </div>

      {/* Popular examples */}
      <div className="clip-examples">
        <span className="examples-label">Try these sample clips:</span>
        <div className="example-pills">
          <Link href="/clip/web-cheatsheet" className="example-pill">
            /clip/web-cheatsheet
          </Link>
          <Link href="/clip/c-snippets" className="example-pill">
            /clip/c-snippets
          </Link>
          <Link href="/clip/scratchpad" className="example-pill">
            /clip/scratchpad
          </Link>
        </div>
      </div>
    </div>
  );
}
