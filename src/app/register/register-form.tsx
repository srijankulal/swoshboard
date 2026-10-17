"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PasswordField from "../login/password-field";

function normalizeEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!trimmed.includes("@")) return `${trimmed}@gmail.com`;
  if (trimmed.endsWith("@")) return `${trimmed}gmail.com`;
  return trimmed;
}

export default function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const finalEmail = normalizeEmail(email);
    setEmail(finalEmail);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: finalEmail, password, secret, terms }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(data.error || "Registration failed.");
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
          <h1 className="auth-title">Create your Swoshboard</h1>
          <p className="auth-subtitle">
            Your own private 200 MB backup space, with files you can email anywhere via Swoshboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} aria-label="Create account form">
          <div className="form-group">
            <label htmlFor="reg-email" className="form-label">Email</label>
            <div className="input-wrapper">
              <input
                id="reg-email"
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
            <label htmlFor="reg-password" className="form-label">Password</label>
            <PasswordField
              id="reg-password"
              value={password}
              onChange={setPassword}
              placeholder="At least 8 characters"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-confirm-password" className="form-label">Confirm Password</label>
            <PasswordField
              id="reg-confirm-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Repeat your password"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-secret" className="form-label">Secret Passage</label>
            <PasswordField
              id="reg-secret"
              value={secret}
              onChange={setSecret}
              placeholder="One word or number (e.g. sunflower or 23081997)"
              minLength={3}
              maxLength={64}
              autoComplete="off"
              ariaDescribedBy="reg-secret-desc"
              required
            />
            <div id="reg-secret-desc" className="input-desc">
              A single word or number that only you know. It is the only way to reset your password if you forget it.
            </div>
          </div>

          <div className="terms-box" role="region" aria-labelledby="terms-heading">
            <div id="terms-heading" className="terms-title">Terms &amp; Conditions</div>
            <div className="terms-scroll" tabIndex={0} aria-label="Terms and conditions text">
              <p>
                By creating an account you agree that all content you store on Swoshboard must be
                <strong> legal and yours to store</strong>.
              </p>
              <ul>
                <li>
                  You are solely responsible for every file you upload, share, or email. Illegal material,
                  malware, pirated content, or anything that breaks the law is strictly prohibited.
                </li>
                <li>
                  Swoshboard is a personal backup space: do not store personal data of other people without
                  their consent.
                </li>
                <li>
                  Swoshboard will be used only to send emails you explicitly initiate from your dashboard.
                </li>
                <li>
                  We may remove illegal content and terminate the account of anyone abusing the service. No
                  refunds or compensation are offered in that case.
                </li>
                <li>Your files are private to your account; you are responsible for keeping them safe.</li>
              </ul>
            </div>
            <label className="terms-check">
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                required
              />
              <span>
                I agree to the Terms &amp; Conditions. I confirm that I will only store legal content and I am
                responsible for everything I store or send.
              </span>
            </label>
          </div>

          {error && <div className="error-text" role="alert" aria-live="assertive">{error}</div>}

          <button type="submit" className="btn-primary" disabled={busy} aria-busy={busy}>
            {busy ? <div className="spinner" aria-hidden="true"></div> : "Create My Dashboard"}
          </button>

          <div className="auth-footer-links">
            <Link href="/login">Already have an account? Sign in</Link>
            <span className="powered-by">Powered by <span className="powered-by-name">Swoshmail</span></span>
            <a href="https://github.com/srijankulal" target="_blank" rel="noopener noreferrer" className="github-link">GitHub</a>
          </div>
        </form>
      </div>
    </main>
  );
}