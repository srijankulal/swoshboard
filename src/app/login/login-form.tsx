"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PasswordField from "./password-field";

function normalizeEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!trimmed.includes("@")) return `${trimmed}@gmail.com`;
  if (trimmed.endsWith("@")) return `${trimmed}gmail.com`;
  return trimmed;
}

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    const finalEmail = normalizeEmail(email);
    setEmail(finalEmail);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: finalEmail, password }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(data.error || "Login failed.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    const finalEmail = normalizeEmail(email);
    setEmail(finalEmail);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: finalEmail, secret, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice("Password reset. Log in with your new password.");
        setMode("login");
        setSecret("");
        setNewPassword("");
      } else {
        setError(data.error || "Reset failed.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setBusy(false);
    }
  };

  const showGmailHint = email.trim().length > 0 && !email.includes("@");

  return (
    <main className="auth-page-wrapper">
      <div className="auth-container glass-panel">
        <div className="auth-header">
          <div className="auth-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
          </div>
          <h1 className="auth-title">Swoshboard</h1>
          <p className="auth-subtitle">
            {mode === "login"
              ? "Your personal backup dashboard. Sign in to continue."
              : "Reset your password with your secret passage."}
          </p>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin} aria-label="Sign in form">
            <div className="form-group">
              <label htmlFor="login-email" className="form-label">Email</label>
              <div className="input-wrapper">
                <input
                  id="login-email"
                  type="text"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="form-input"
                  placeholder="username or you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmail((prev) => normalizeEmail(prev))}
                  autoComplete="email"
                  autoFocus
                  required
                />
                {showGmailHint && (
                  <span className="email-domain-hint" aria-hidden="true">@gmail.com</span>
                )}
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="login-password" className="form-label">Password</label>
              <PasswordField
                id="login-password"
                value={password}
                onChange={setPassword}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </div>

            {error && <div className="error-text" role="alert" aria-live="assertive">{error}</div>}
            {notice && <div className="notice-text" role="status" aria-live="polite">{notice}</div>}

            <button type="submit" className="btn-primary" disabled={busy} aria-busy={busy}>
              {busy ? <div className="spinner" aria-hidden="true"></div> : "Sign In"}
            </button>

            <div className="auth-links">
              <button type="button" className="link-btn" onClick={() => { setMode("reset"); setError(""); setNotice(""); }}>
                Forgot password? Use your secret passage
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleReset} aria-label="Reset password form">
            <div className="form-group">
              <label htmlFor="reset-email" className="form-label">Email</label>
              <div className="input-wrapper">
                <input
                  id="reset-email"
                  type="text"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="form-input"
                  placeholder="username or you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmail((prev) => normalizeEmail(prev))}
                  autoComplete="email"
                  required
                />
                {showGmailHint && (
                  <span className="email-domain-hint" aria-hidden="true">@gmail.com</span>
                )}
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="reset-secret" className="form-label">Secret Passage</label>
              <PasswordField
                id="reset-secret"
                value={secret}
                onChange={setSecret}
                placeholder="The word / number you chose at signup"
                autoComplete="off"
                ariaDescribedBy="reset-secret-desc"
                required
              />
              <div id="reset-secret-desc" className="input-desc">A single word or number that only you know.</div>
            </div>
            <div className="form-group">
              <label htmlFor="reset-new-password" className="form-label">New Password</label>
              <PasswordField
                id="reset-new-password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="At least 8 characters"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>

            {error && <div className="error-text" role="alert" aria-live="assertive">{error}</div>}
            {notice && <div className="notice-text" role="status" aria-live="polite">{notice}</div>}

            <button type="submit" className="btn-primary" disabled={busy} aria-busy={busy}>
              {busy ? <div className="spinner" aria-hidden="true"></div> : "Reset Password"}
            </button>

            <div className="auth-links">
              <button type="button" className="link-btn" onClick={() => { setMode("login"); setError(""); setNotice(""); }}>
                Back to sign in
              </button>
            </div>
          </form>
        )}

        <div className="auth-footer-links">
          <Link href="/register">Create an account</Link>
          <span className="powered-by">Powered by <span className="powered-by-name">Swoshmail</span></span>
          <a href="https://github.com/srijankulal" target="_blank" rel="noopener noreferrer" className="github-link">GitHub</a>
        </div>
      </div>
    </main>
  );
}