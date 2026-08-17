import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="auth-container glass-panel terms-page">
      <div className="auth-header">
        <div className="auth-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <h1 className="auth-title">Terms &amp; Conditions</h1>
        <p className="auth-subtitle">Last updated: August 2026</p>
      </div>

      <div className="terms-scroll terms-page-scroll">
        <p>
          By creating an account on <strong>Swoshboard</strong> you agree to the following terms:
        </p>
        <ul>
          <li>
            Everything you store must be <strong>legal</strong>. Illegal material, malware, pirated
            content, or anything that breaks the law is strictly prohibited.
          </li>
          <li>
            You are <strong>solely responsible</strong> for all content you upload, download, share, or
            email from your dashboard. Any illegal activity is your responsibility alone.
          </li>
          <li>
            Don&apos;t store personal data of other people without their consent.
          </li>
          <li>
            Swoshmail sends only emails you explicitly initiate; we never read or share your files.
          </li>
          <li>
            We may remove illegal content and terminate accounts that abuse or damage the service, without
            compensation or refund.
          </li>
          <li>
            Storage is limited to the published quota (200&nbsp;MB per account). Fair, personal use only.
          </li>
          <li>
            Your credentials are stored encrypted (passwords hashed, secret passage encrypted) and your
            sessions expire automatically.
          </li>
          <li>
            The service may change or shut down; no data-loss compensation is offered. Keep backups of
            anything important.
          </li>
        </ul>
        <p>
          Questions? Ask the Swoshmail owner for help.
        </p>
      </div>

      <div className="auth-footer-links">
        <Link href="/login">Back to sign in</Link>
        <span className="powered-by">Powered by <span className="powered-by-name">Swoshmail</span></span>
      </div>
    </div>
  );
}