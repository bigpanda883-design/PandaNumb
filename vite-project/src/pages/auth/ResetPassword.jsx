import { useEffect, useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheckCircle,
  FiEye,
  FiEyeOff,
  FiLoader,
  FiMoon,
  FiSun,
  FiX,
} from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { saveSession } from "../../auth/authStorage";
import { useTheme } from "../../context/themeStore";
import { requestJson } from "../../services/httpClient";
import "../../CSS/auth/Login.css";
import "../../CSS/auth/ResetPassword.css";

const passwordRules = [
  { label: "At least 8 characters", test: (value) => value.length >= 8 },
  { label: "An uppercase letter", test: (value) => /[A-Z]/.test(value) },
  { label: "A lowercase letter", test: (value) => /[a-z]/.test(value) },
  { label: "A number", test: (value) => /\d/.test(value) },
  {
    label: "A special character",
    test: (value) => /[^A-Za-z0-9]/.test(value),
  },
];

function ResetPassword() {
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();
  const [resetToken] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("token") || "",
  );
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [toast, setToast] = useState(null);

  const passedRules = useMemo(
    () => passwordRules.filter((rule) => rule.test(newPassword)).length,
    [newPassword],
  );

  useEffect(() => {
    if (!resetToken) return undefined;
    window.history.replaceState(
      window.history.state,
      document.title,
      window.location.pathname,
    );
    return undefined;
  }, [resetToken]);

  useEffect(() => {
    if (!success || !sessionSaved) return undefined;
    const timer = window.setTimeout(
      () => navigate("/dashboard", { replace: true }),
      1500,
    );
    return () => window.clearTimeout(timer);
  }, [navigate, sessionSaved, success]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!resetToken) {
      setError("This reset link is missing or invalid. Request a new link.");
      return;
    }

    if (passedRules !== passwordRules.length) {
      setError("Choose a password that meets all the requirements below.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = await requestJson("/api/auth/reset-password", {
        method: "POST",
        operation: "reset password",
        body: { resetToken, newPassword },
        timeoutMs: 30_000,
      });

      if (!payload?.ok || !payload?.user || !payload?.token) {
        throw new Error(
          "The server did not confirm the password update and sign-in.",
        );
      }

      const fullName =
        payload.user.fullName ||
        payload.user.name ||
        payload.user.email?.split("@")[0] ||
        "Panda Number user";
      const saved = saveSession(
        {
          fullName,
          email: payload.user.email,
          phone: payload.user.phone || "",
          initials: fullName
            .split(/\s+/)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase(),
        },
        payload.token,
      );
      setSessionSaved(saved);
      setSuccess(true);
      if (!saved) {
        setError(
          "Your password was updated, but this browser could not save your session. Sign in with your new password.",
        );
      }
    } catch (requestError) {
      const message =
        requestError?.message ||
        "The reset link is invalid or expired. Request a new link.";
      setError(message);
      setToast(message);
      window.setTimeout(() => setToast(null), 4500);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      {toast && (
        <div className="auth-mobile-popup error" role="alert">
          <div className="popup-content">
            <FiAlertCircle className="popup-icon" aria-hidden="true" />
            <span>{toast}</span>
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
            <h1>Choose a new password.</h1>
            <p>
              Keep your Panda Number account secure with a strong password you
              haven’t used before.
            </p>
          </div>
          <p className="auth-footer-note">
            This single-use reset link expires 15 minutes after it was sent.
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
            <span className="auth-tab active">Reset Password</span>
            <Link to="/signup" className="auth-tab">
              Create Account
            </Link>
          </div>

          {success ? (
            <div className="auth-heading reset-success" role="status">
              <FiCheckCircle size={36} aria-hidden="true" />
              <h1>Password Reset Successful</h1>
              <p>
                Your password has been updated.
                {sessionSaved
                  ? " You are signed in and will be redirected to your dashboard."
                  : " Sign in with your new password to continue."}
              </p>
              {sessionSaved ? (
                <span className="reset-redirect-note">Opening dashboard…</span>
              ) : (
                <Link className="auth-submit reset-login-link" to="/login">
                  Sign in
                </Link>
              )}
            </div>
          ) : !resetToken ? (
            <div className="auth-heading">
              <h1>Reset link unavailable</h1>
              <p>
                This link is incomplete. Request a new password reset link to
                continue.
              </p>
              <Link className="auth-submit reset-login-link" to="/forgot-password">
                Request a new reset link
              </Link>
            </div>
          ) : (
            <>
              <div className="auth-heading">
                <h1>Create a new password</h1>
                <p>Enter and confirm your new password below.</p>
              </div>

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <div className="field-group">
                  <label htmlFor="reset-new-password">New password</label>
                  <div className="password-input-wrap">
                    <input
                      id="reset-new-password"
                      name="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => {
                        setNewPassword(event.target.value);
                        setError("");
                      }}
                      placeholder="Enter a new password"
                      aria-describedby="password-strength"
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() =>
                        setShowNewPassword((current) => !current)
                      }
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? (
                        <FiEyeOff aria-hidden="true" />
                      ) : (
                        <FiEye aria-hidden="true" />
                      )}
                    </button>
                  </div>

                  <div
                    id="password-strength"
                    className="password-strength"
                    aria-live="polite"
                  >
                    <div className="password-strength-track">
                      {passwordRules.map((rule, index) => (
                        <span
                          key={rule.label}
                          className={
                            index < passedRules ? "strength-segment passed" : "strength-segment"
                          }
                        />
                      ))}
                    </div>
                    <span>
                      {newPassword
                        ? `${passedRules} of ${passwordRules.length} requirements met`
                        : "Password requirements"}
                    </span>
                    <ul>
                      {passwordRules.map((rule) => (
                        <li
                          key={rule.label}
                          className={
                            rule.test(newPassword) ? "requirement-met" : ""
                          }
                        >
                          {rule.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="field-group">
                  <label htmlFor="reset-confirm-password">
                    Confirm password
                  </label>
                  <div className="password-input-wrap">
                    <input
                      id="reset-confirm-password"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        setError("");
                      }}
                      placeholder="Confirm your new password"
                      aria-invalid={Boolean(
                        confirmPassword && confirmPassword !== newPassword,
                      )}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() =>
                        setShowConfirmPassword((current) => !current)
                      }
                      aria-label={
                        showConfirmPassword
                          ? "Hide password"
                          : "Show password"
                      }
                    >
                      {showConfirmPassword ? (
                        <FiEyeOff aria-hidden="true" />
                      ) : (
                        <FiEye aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {confirmPassword && confirmPassword !== newPassword && (
                    <span className="field-error" role="alert">
                      Passwords do not match.
                    </span>
                  )}
                </div>

                {error && (
                  <p className="auth-form-error" role="alert">
                    {error}
                    {error.toLowerCase().includes("expired") ||
                    error.toLowerCase().includes("invalid") ? (
                      <>
                        {" "}
                        <Link to="/forgot-password">Request another link</Link>
                      </>
                    ) : null}
                  </p>
                )}

                <button
                  className="auth-submit"
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <FiLoader className="loading-icon" aria-hidden="true" />{" "}
                      Updating password…
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default ResetPassword;
