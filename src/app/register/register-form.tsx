"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PasswordField from "../login/password-field";

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

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, secret, terms }),
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

  return (
    <div className="auth-container glass-panel">
      <div className="auth-header">
        <div className="auth-icon">
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

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            type="email"
            className="form-input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <PasswordField
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Confirm Password</label>
          <PasswordField
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Repeat your password"
            minLength={8}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Secret Passage</label>
          <PasswordField
            value={secret}
            onChange={setSecret}
            placeholder="One word or number (e.g. sunflower or 23081997)"
            minLength={3}
            maxLength={64}
            required
          />
          <div className="input-desc">
            A single word or number that only you know. It is the only way to reset your password if you forget it.
          </div>
        </div>

        <div className="terms-box">
          <div className="terms-title">Terms &amp; Conditions</div>
          <div className="terms-scroll">
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

        {error && <div className="error-text">{error}</div>}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? <div className="spinner"></div> : "Create My Dashboard"}
        </button>

        <div className="auth-footer-links">
          <Link href="/login">Already have an account? Sign in</Link>
          <span className="powered-by">Powered by <span className="powered-by-name">Swoshmail</span></span>
          <a href="https://github.com/srijankulal" target="_blank" rel="noopener noreferrer" className="github-link">GitHub</a>
        </div>
      </form>
    </div>
  );
}