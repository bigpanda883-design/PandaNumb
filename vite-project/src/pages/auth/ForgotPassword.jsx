import { useState } from "react";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheckCircle,
  FiLoader,
  FiMoon,
  FiSun,
  FiX,
} from "react-icons/fi";
import { Link } from "react-router-dom";
import { useTheme } from "../../context/themeStore";
import { requestJson } from "../../services/httpClient";
import "../../CSS/auth/Login.css";

function ForgotPassword() {
  const { isDarkMode, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [toast, setToast] = useState(null);

  const triggerToast = (message, type = "error") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4500);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      const payload = await requestJson("/api/auth/forgot-password", {
        method: "POST",
        operation: "send password reset link",
        body: { email: normalizedEmail },
        timeoutMs: 30_000,
      });
      if (!payload || typeof payload.message !== "string") {
        throw new Error("The server did not confirm the reset request.");
      }
      setRequestSent(true);
    } catch (requestError) {
      const message =
        requestError?.message || "Could not send the reset link. Try again.";
      setError(message);
      triggerToast(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      {toast && (
        <div className={`auth-mobile-popup ${toast.type}`} role="alert">
          <div className="popup-content">
            <FiAlertCircle className="popup-icon" aria-hidden="true" />
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            className="popup-close-btn"
            aria-label="Dismiss message"
            onClick={() => setToast(null)}
          >
            <FiX />
          </button>
        </div>
      )}

      <div className="auth-left-panel">
        <div className="auth-left-content">
          <div className="auth-brand-header">
            <div className="auth-brand-mark">P.</div>
            <span className="auth-brand-name">Panda Numbers</span>
          </div>
          <div className="auth-hero-text">
            <h1>Get back to your Panda Number account.</h1>
            <p>
              We’ll email a secure, single-use password reset link that expires
              after 15 minutes.
            </p>
          </div>
          <p className="auth-footer-note">
            Your password only changes after you use the secure link.
          </p>
        </div>
      </div>

      <div className="auth-right-panel">
        <div className="auth-form-wrapper">
          <div className="auth-top-bar">
            <Link className="auth-back-link" to="/login">
              <FiArrowLeft aria-hidden="true" />
              Back to login
            </Link>
            <button
              type="button"
              className="auth-theme-toggle"
              aria-label={
                isDarkMode ? "Switch to light mode" : "Switch to dark mode"
              }
              onClick={toggleTheme}
            >
              {isDarkMode ? <FiSun size={18} /> : <FiMoon size={18} />}
            </button>
          </div>

          <div className="auth-tabs">
            <span className="auth-tab active">Forgot Password</span>
            <Link to="/signup" className="auth-tab">
              Create Account
            </Link>
          </div>

          {requestSent ? (
            <div className="auth-heading" role="status" aria-live="polite">
              <FiCheckCircle
                size={32}
                color="#16a34a"
                aria-hidden="true"
              />
              <h1>Check your email</h1>
              <p>
                If an account exists for <strong>{email.trim()}</strong>, a
                password reset link has been sent. The link expires in 15
                minutes. Check your spam folder too.
              </p>
              <button
                type="button"
                className="auth-submit"
                onClick={() => setRequestSent(false)}
              >
                Try another email
              </button>
            </div>
          ) : (
            <>
              <div className="auth-heading">
                <h1>Reset your password</h1>
                <p>Enter the email address linked to your account.</p>
              </div>

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <div className="field-group">
                  <label htmlFor="reset-email">Email address</label>
                  <input
                    id="reset-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setError("");
                    }}
                    className={error ? "input-error" : ""}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "reset-email-error" : undefined}
                    placeholder="you@example.com"
                    required
                  />
                  {error && (
                    <span id="reset-email-error" className="field-error">
                      {error}
                    </span>
                  )}
                </div>

                <button
                  className="auth-submit"
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <FiLoader className="loading-icon" aria-hidden="true" />{" "}
                      Sending reset link…
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>
            </>
          )}
          <p className="auth-switch">
            Remember your password? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default ForgotPassword;
