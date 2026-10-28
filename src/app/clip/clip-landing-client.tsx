"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const DEFAULT_HOST = "swoshboard.vercel.app";
const subscribeNoop = () => () => {};

export default function ClipLandingClient() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");

  const hostPrefix = useSyncExternalStore(
    subscribeNoop,
    () => window.location.host || DEFAULT_HOST,
    () => DEFAULT_HOST
  );

  const sanitizeSlug = (raw: string): string => {
    let clean = raw.trim();
    // Support pasting full URLs (e.g. http://localhost:3000/clip/my-slug or https://swoshboard.vercel.app/clip/my-slug)
    try {
      if (clean.startsWith("http://") || clean.startsWith("https://")) {
        const url = new URL(clean);
        const parts = url.pathname.split("/").filter(Boolean);
        const clipIdx = parts.indexOf("clip");
        if (clipIdx !== -1 && parts[clipIdx + 1]) {
          clean = parts[clipIdx + 1];
        } else if (parts.length > 0) {
          clean = parts[parts.length - 1];
        }
      }
    } catch {
      /* continue */
    }

    clean = clean.replace(/^https?:\/\/[^/]+/i, "");
    clean = clean.replace(/^\/?clip\//i, "");
    return clean
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleOpenClip = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = sanitizeSlug(slug);

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

  const previewSlug = sanitizeSlug(slug) || "your-custom-name";

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
      <form onSubmit={handleOpenClip} className="clip-url-box" role="search">
        <label htmlFor="clip-slug-input" className="visually-hidden">
          Custom Clip Name or URL
        </label>
        <div className="clip-url-prefix" title="Public clip destination">
          <span className="clip-url-icon" aria-hidden="true">🔗</span>
          <span className="clip-url-domain">{hostPrefix}/clip/</span>
        </div>
        <div className="clip-url-input-wrap">
          <input
            id="clip-slug-input"
            name="clipSlug"
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
            autoComplete="off"
            aria-describedby="clip-url-hint"
          />
          {slug && (
            <button
              type="button"
              className="clip-clear-btn"
              onClick={() => {
                setSlug("");
                if (error) setError("");
              }}
              title="Clear text"
              aria-label="Clear clip name"
            >
              ✕
            </button>
          )}
        </div>
        <button type="submit" className="btn btn-primary clip-go-btn">
          <span>Go to Clip</span>
          <span aria-hidden="true">→</span>
        </button>
      </form>

      {/* Live Destination URL Preview */}
      <div id="clip-url-hint" className="clip-url-hint">
        <span>Destination:</span>{" "}
        <code>
          {hostPrefix}/clip/{previewSlug}
        </code>
      </div>

      {error && (
        <div className="clip-error-banner" role="alert">
          <span className="error-icon" aria-hidden="true">⚠️</span>
          <span>{error}</span>
        </div>
      )}

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
