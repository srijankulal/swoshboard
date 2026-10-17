"use client";

import { useState } from "react";

interface PasswordFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  autoComplete?: string;
  ariaDescribedBy?: string;
}

export default function PasswordField({
  id,
  value,
  onChange,
  placeholder,
  autoFocus,
  minLength,
  maxLength,
  required,
  autoComplete,
  ariaDescribedBy,
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="input-wrapper">
      <input
        id={id}
        type={show ? "text" : "password"}
        className="form-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        minLength={minLength}
        maxLength={maxLength}
        required={required}
        autoComplete={autoComplete}
        aria-describedby={ariaDescribedBy}
        style={{ paddingRight: "44px" }}
      />
      <button
        type="button"
        className="eye-btn"
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        onClick={() => setShow((s) => !s)}
      >
        {show ? (
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        ) : (
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        )}
      </button>
    </div>
  );
}