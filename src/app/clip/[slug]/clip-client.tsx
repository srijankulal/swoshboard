"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";

interface GlobalClipData {
  slug: string;
  title: string;
  content: string;
  format: string;
  isLocked: boolean;
  views: number;
  burnAfterReading: boolean;
  expiresAt: number | null;
  createdAt?: number;
  updatedAt?: number;
}

export default function ClipClient({ slug }: { slug: string }) {
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("text");
  const [isLocked, setIsLocked] = useState(false);
  const [burnAfterReading, setBurnAfterReading] = useState(false);
  const [expiryHours, setExpiryHours] = useState(0);
  const [views, setViews] = useState(0);
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadClip = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/clip/${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.found && data.clip) {
          const c = data.clip as GlobalClipData;
          setContent(c.content || "");
          setTitle(c.title || "");
          setFormat(c.format || "text");
          setIsLocked(Boolean(c.isLocked));
          setBurnAfterReading(Boolean(c.burnAfterReading));
          setViews(c.views || 1);
          setLastSaved(c.updatedAt || Date.now());
          if (c.expiresAt) {
            const diffHours = Math.round((c.expiresAt - Date.now()) / (3600 * 1000));
            setExpiryHours(diffHours > 0 ? diffHours : 0);
          }
        } else {
          // Empty new clip
          setContent("");
          setTitle("");
          setLastSaved(null);
        }
      } else {
        setStatusMsg("Failed to load clip.");
      }
    } catch {
      setStatusMsg("Connection error loading clip.");
    } finally {
      setLoading(false);
      setIsDirty(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadClip();
  }, [loadClip]);

  const handleSave = async () => {
    if (isLocked) {
      alert("This clip is locked and cannot be edited.");
      return;
    }
    setSaving(true);
    setStatusMsg("");
    try {
      const res = await fetch(`/api/clip/${encodeURIComponent(slug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          title,
          format,
          isLocked,
          burnAfterReading,
          expiryHours: expiryHours > 0 ? expiryHours : null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLastSaved(Date.now());
        setIsDirty(false);
        setStatusMsg("✓ Saved successfully");
        setTimeout(() => setStatusMsg(""), 3000);
      } else {
        setStatusMsg(data.error || "Save failed.");
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Error saving clip.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyContent = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setStatusMsg("✓ Content copied to clipboard!");
      setTimeout(() => setStatusMsg(""), 2500);
    } catch {
      setStatusMsg("Could not copy to clipboard.");
    }
  };

  const handleCopyUrl = async () => {
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      setStatusMsg("✓ Clip URL copied to clipboard!");
      setTimeout(() => setStatusMsg(""), 2500);
    } catch {
      setStatusMsg("Could not copy URL.");
    }
  };

  const handleDownloadFile = () => {
    const ext =
      format === "cpp"
        ? "cpp"
        : format === "sql"
        ? "sql"
        : format === "html"
        ? "html"
        : format === "json"
        ? "json"
        : format === "markdown"
        ? "md"
        : "txt";
    const filename = `${slug}.${ext}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete clip "${slug}"?`)) return;
    try {
      const res = await fetch(`/api/clip/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setContent("");
        setTitle("");
        setStatusMsg("Clip deleted.");
        setIsDirty(false);
      } else {
        const d = await res.json();
        alert(d.error || "Failed to delete.");
      }
    } catch {
      alert("Error deleting clip.");
    }
  };

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const charCount = content.length;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const lineCount = content ? content.split("\n").length : 1;

  const currentUrl = typeof window !== "undefined" ? window.location.href : `https://swoshboard.vercel.app/clip/${slug}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
    currentUrl
  )}`;

  return (
    <div className="clip-editor-page">
      {/* Top Navbar */}
      <header className="clip-editor-header">
        <div className="clip-header-left">
          <Link href="/clip" className="clip-back-link" title="All Clips">
            ← Clips
          </Link>
          <div className="clip-slug-badge">
            <span className="clip-slug-prefix">/clip/</span>
            <span className="clip-slug-name">{slug}</span>
          </div>
          {isLocked && <span className="clip-locked-badge">🔒 Locked</span>}
          {burnAfterReading && <span className="clip-burn-badge">🔥 Burn on Read</span>}
        </div>

        <div className="clip-header-center">
          <input
            type="text"
            className="clip-title-input"
            placeholder="Optional Title (e.g. Lab Exercise 3, Quick Snippet...)"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setIsDirty(true);
            }}
            disabled={isLocked}
          />
        </div>

        <div className="clip-header-right">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCopyUrl}
            title="Copy shareable link"
          >
            🔗 Copy Link
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setQrOpen(true)}
            title="Show QR Code to scan with mobile"
          >
            📱 QR Code
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setOptionsOpen(!optionsOpen)}
            title="Clip Settings"
          >
            ⚙️ Options
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm clip-save-btn"
            onClick={handleSave}
            disabled={saving || isLocked}
            title="Save changes (Ctrl+S)"
          >
            {saving ? "Saving..." : "💾 Save"}
          </button>
        </div>
      </header>

      {/* Options Panel Drawer */}
      {optionsOpen && (
        <div className="clip-options-drawer">
          <div className="clip-options-inner">
            <div className="clip-option-group">
              <label htmlFor="clip-format-select">Format</label>
              <select
                id="clip-format-select"
                className="form-select form-select-sm"
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value);
                  setIsDirty(true);
                }}
              >
                <option value="text">Plain Text</option>
                <option value="cpp">C++ Source</option>
                <option value="sql">SQL Query</option>
                <option value="html">HTML / JavaScript</option>
                <option value="markdown">Markdown</option>
                <option value="json">JSON</option>
              </select>
            </div>

            <div className="clip-option-group">
              <label htmlFor="clip-expiry-select">Auto-Expiry</label>
              <select
                id="clip-expiry-select"
                className="form-select form-select-sm"
                value={expiryHours}
                onChange={(e) => {
                  setExpiryHours(Number(e.target.value));
                  setIsDirty(true);
                }}
              >
                <option value={0}>Never Expire</option>
                <option value={1}>1 Hour</option>
                <option value={24}>24 Hours (1 Day)</option>
                <option value={168}>7 Days</option>
              </select>
            </div>

            <div className="clip-option-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={burnAfterReading}
                  onChange={(e) => {
                    setBurnAfterReading(e.target.checked);
                    setIsDirty(true);
                  }}
                />
                <span>🔥 Burn After Reading (Destruct on next view)</span>
              </label>
            </div>

            <div className="clip-option-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isLocked}
                  onChange={(e) => {
                    setIsLocked(e.target.checked);
                    setIsDirty(true);
                  }}
                />
                <span>🔒 Read-Only (Lock from edits)</span>
              </label>
            </div>

            <div className="clip-options-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDownloadFile}
              >
                ⬇ Download as File
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleDelete}
              >
                🗑 Delete Clip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor Body */}
      <main className="clip-editor-main">
        {loading ? (
          <div className="clip-loading">
            <span className="spinner" />
            <p>Loading clip...</p>
          </div>
        ) : (
          <div className="clip-textarea-wrapper">
            <textarea
              ref={textareaRef}
              className={`clip-textarea format-${format}`}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setIsDirty(true);
              }}
              placeholder={`Type or paste anything here...\n\nThis clip is accessible anytime at:\n${currentUrl}\n\nPress Ctrl+S to save.`}
              spellCheck={false}
              disabled={isLocked}
            />
          </div>
        )}
      </main>

      {/* Bottom Status Bar */}
      <footer className="clip-editor-footer">
        <div className="clip-footer-left">
          <span className="clip-stat">{lineCount} lines</span>
          <span className="clip-stat-dot">•</span>
          <span className="clip-stat">{wordCount} words</span>
          <span className="clip-stat-dot">•</span>
          <span className="clip-stat">{charCount.toLocaleString()} chars</span>
          {views > 0 && (
            <>
              <span className="clip-stat-dot">•</span>
              <span className="clip-stat">👁 {views} views</span>
            </>
          )}
        </div>

        <div className="clip-footer-center">
          {statusMsg && <span className="clip-status-message">{statusMsg}</span>}
          {!statusMsg && isDirty && <span className="clip-unsaved-badge">● Unsaved Changes</span>}
          {!statusMsg && !isDirty && lastSaved && (
            <span className="clip-saved-badge">✓ All changes saved</span>
          )}
        </div>

        <div className="clip-footer-right">
          <button
            type="button"
            className="btn-text-sm"
            onClick={handleCopyContent}
            title="Copy full text"
          >
            📋 Copy Text
          </button>
          <button
            type="button"
            className="btn-text-sm"
            onClick={handleDownloadFile}
            title="Download file"
          >
            ⬇ Download
          </button>
          <Link href="/dashboard" className="btn-text-sm">
            Swoshboard Dashboard →
          </Link>
        </div>
      </footer>

      {/* QR Code Modal for Phone Sync */}
      {qrOpen && (
        <div className="clip-modal-overlay" onClick={() => setQrOpen(false)}>
          <div className="clip-qr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="clip-modal-header">
              <h3>📱 Scan with Phone Camera</h3>
              <button
                type="button"
                className="lab-close-btn"
                onClick={() => setQrOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="clip-qr-body">
              <p className="qr-hint">
                Scan this QR code with your mobile camera to instantly open this clip on your phone.
              </p>
              <div className="qr-image-wrapper">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrUrl}
                  alt={`QR code for ${slug}`}
                  width={250}
                  height={250}
                  className="qr-image"
                />
              </div>
              <div className="qr-url-display">
                <code>{currentUrl}</code>
              </div>
            </div>
            <div className="clip-modal-footer">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCopyUrl}
              >
                Copy Link
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setQrOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
