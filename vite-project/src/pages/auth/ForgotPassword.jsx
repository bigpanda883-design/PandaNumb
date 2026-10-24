import { useMemo, useState } from "react";
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

const initialValues = {
  email: "",
  code: "",
  newPassword: "",
  confirmPassword: "",
};

function ForgotPassword() {
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState("email");
  // Proof that the six-digit code was verified. Kept in memory only: it is not
  // written to localStorage or sent in a URL, and a page reload asks the user to
  // verify again rather than leaving a usable reset session lying around.
  const [resetToken, setResetToken] = useState("");
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "error",
  });

  const currentTitle = useMemo(() => {
    if (step === "email") return "Reset your password";
    if (step === "code") return "Verify your code";
    return "Create a new password";
  }, [step]);

  const currentSubtitle = useMemo(() => {
    if (step === "email") return "Enter your email to receive a reset code.";
    if (step === "code") return "Enter the 6-digit code sent to your inbox.";
    return "Choose a strong new password to continue.";
  }, [step]);

  const triggerToast = (message, type = "error") => {
    setToast({ show: true, message, type });
    window.setTimeout(() => {
      setToast({ show: false, message: "", type: "error" });
    }, 4500);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  };

  const validateEmail = () => {
    const nextErrors = {};
    const email = values.email.trim();

    if (!email) {
      nextErrors.email = "Email address is required.";
    } else if (
      !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)
    ) {
      nextErrors.email = "Please enter a valid email address.";
    }

    return nextErrors;
  };

  const validateCode = () => {
    const nextErrors = {};
    if (!/^\d{6}$/.test(values.code.trim())) {
      nextErrors.code = "Enter the 6-digit verification code.";
    }
    return nextErrors;
  };

  const validateReset = () => {
    const nextErrors = {};
    const password = values.newPassword;

    if (!password) {
      nextErrors.newPassword = "New password is required.";
    } else if (
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password)
    ) {
      nextErrors.newPassword =
        "Password must contain uppercase, lowercase, number and special character.";
    }

    if (!values.confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your new password.";
    } else if (values.confirmPassword !== password) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    return nextErrors;
  };

  const handleRequestCode = async (event) => {
    event.preventDefault();
    const nextErrors = validateEmail();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      triggerToast(nextErrors.email, "error");
      return;
    }

      setIsSubmitting(true);
      try {
        const payload = await requestJson("/api/auth/forgot-password", {
          method: "POST",
          operation: "send reset code",
          body: { email: values.email.trim().toLowerCase() },
        });

        // Advance ONLY when the backend actually answered 2xx. The old code
        // moved to the code step and announced "code sent" for any response that
        // parsed as JSON - including an HTML page from the frontend host, which
        // is exactly what a phone hitting the Vercel rewrite sees. Now a failed
        // request (including a 503 from an unconfigured mail server) keeps the
        // user on this step with the server's own message.
        if (!payload || typeof payload !== "object") {
          throw new Error(
            "The server did not confirm the request. No code was sent. Please try again.",
          );
        }

        setStep("code");
        triggerToast(
          payload.message || "A reset code has been sent to your email.",
          "success",
        );
      } catch (error) {
        // Never claim delivery when the request failed.
        triggerToast(
          error?.message || "Could not send reset code. Please try again.",
          "error",
        );
      } finally {
        setIsSubmitting(false);
      }
    };

  const handleVerifyCode = async (event) => {
    event.preventDefault();
    const nextErrors = validateCode();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      triggerToast(nextErrors.code, "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = await requestJson("/api/auth/verify-reset-code", {
        method: "POST",
        operation: "verify reset code",
        body: {
          email: values.email.trim().toLowerCase(),
          code: values.code.trim(),
        },
      });

      // The six-digit code is exchanged for a short-lived, single-use token.
      // Only the token can change the password, so the code is never re-sent at
      // the reset step. It stays in memory for this flow only (not in
      // localStorage), so closing the page ends the reset session.
      if (!payload?.resetToken) {
        throw new Error(
          "The code was verified, but no reset session was issued. Please try again.",
        );
      }
      setResetToken(payload.resetToken);

      setStep("reset");
      triggerToast("Code verified. Create your new password.", "success");
    } catch (error) {
      triggerToast(error?.message || "Verification failed.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();

    // Without a verified session there is nothing to authorise the change.
    if (!resetToken) {
      setStep("code");
      triggerToast("Please verify your code again to continue.", "error");
      return;
    }

    const nextErrors = validateReset();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      triggerToast(Object.values(nextErrors)[0], "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = await requestJson("/api/auth/reset-password", {
        method: "POST",
        operation: "reset password",
        body: {
          resetToken,
          newPassword: values.newPassword,
        },
      });

      // Only a server that accepted the new password may sign the user back
      // in. requestJson already threw on a non-2xx, so reaching here means the
      // password really changed.
      if (!payload || typeof payload !== "object") {
        throw new Error(
          "The password change was not confirmed by the server. Please try again.",
        );
      }

      if (payload.user) {
        // User + token are written together, in that order. The old code wrote
        // the token FIRST; when another account had been signed in on this
        // browser, setAuthUser() then cleared the account's storage - including
        // that just-saved token - leaving a signed-in user with no session.
        const fullName =
          payload.user.fullName ||
          payload.user.name ||
          values.email.split("@")[0];
        saveSession(
          {
            fullName,
            email: payload.user.email || values.email.trim(),
            phone: payload.user.phone || "",
            initials: fullName.slice(0, 2).toUpperCase(),
          },
          payload.token || "",
        );
      } else if (payload.token) {
        // The password changed but no user record came back: the user must log
        // in with the NEW password rather than being half-signed-in.
        triggerToast(
          "Password changed. Please log in with your new password.",
          "success",
        );
        navigate("/login", { replace: true });
        return;
      }

      triggerToast("Password reset successful. Redirecting...", "success");

      setTimeout(() => {
        navigate("/dashboard", { replace: true });
      }, 600);
    } catch (error) {
      triggerToast(
        error?.message || "Password reset failed. Please try again.",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <main className="auth-page">
      {toast.show && (
        <div className={`auth-mobile-popup ${toast.type}`} role="alert">
          <div className="popup-content">
            {toast.type === "error" ? (
              <FiAlertCircle className="popup-icon" />
            ) : (
              <FiCheckCircle className="popup-icon" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            className="popup-close-btn"
            onClick={() => setToast({ ...toast, show: false })}
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
            <h1>Your numbers, wallet and transactions — all in one place.</h1>
            <p>
              Fund from ₦100, buy a number in four steps and keep every order
              and verification code together.
            </p>
          </div>

          <p className="auth-footer-note">
            Balances and prices are always verified on our servers.
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
            <Link to="/login" className="auth-tab active">
              Forgot Password
            </Link>
            <Link to="/signup" className="auth-tab">
              Create Account
            </Link>
          </div>

          <div className="auth-heading">
            <h1>{currentTitle}</h1>
            <p>{currentSubtitle}</p>
          </div>

          {step === "email" && (
            <form className="auth-form" onSubmit={handleRequestCode} noValidate>
              <div className="field-group">
                <label htmlFor="reset-email">Email</label>
                <input
                  id="reset-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={values.email}
                  onChange={handleChange}
                  className={errors.email ? "input-error" : ""}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={
                    errors.email ? "reset-email-error" : undefined
                  }
                  placeholder="you@example.com"
                />
                {errors.email && (
                  <span id="reset-email-error" className="field-error">
                    {errors.email}
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
                    Sending...
                  </>
                ) : (
                  "Send verification code"
                )}
              </button>
            </form>
          )}

          {step === "code" && (
            <form className="auth-form" onSubmit={handleVerifyCode} noValidate>
              <div className="field-group">
                <label htmlFor="reset-code">Verification code</label>
                <input
                  id="reset-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={values.code}
                  onChange={handleChange}
                  className={errors.code ? "input-error" : ""}
                  aria-invalid={Boolean(errors.code)}
                  aria-describedby={
                    errors.code ? "reset-code-error" : undefined
                  }
                  placeholder="123456"
                />
                {errors.code && (
                  <span id="reset-code-error" className="field-error">
                    {errors.code}
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
                    Verifying...
                  </>
                ) : (
                  "Verify code"
                )}
              </button>
            </form>
          )}

          {step === "reset" && (
            <form
              className="auth-form"
              onSubmit={handleResetPassword}
              noValidate
            >
              <div className="field-group">
                <label htmlFor="reset-new-password">New password</label>
                <div className="password-input-wrap">
                  <input
                    id="reset-new-password"
                    name="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={values.newPassword}
                    onChange={handleChange}
                    className={errors.newPassword ? "input-error" : ""}
                    aria-invalid={Boolean(errors.newPassword)}
                    aria-describedby={
                      errors.newPassword
                        ? "reset-new-password-error"
                        : undefined
                    }
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowNewPassword((current) => !current)}
                    aria-label={
                      showNewPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showNewPassword ? (
                      <FiEyeOff aria-hidden="true" />
                    ) : (
                      <FiEye aria-hidden="true" />
                    )}
                  </button>
                </div>
                {errors.newPassword && (
                  <span id="reset-new-password-error" className="field-error">
                    {errors.newPassword}
                  </span>
                )}
              </div>

              <div className="field-group">
                <label htmlFor="reset-confirm-password">Confirm password</label>
                <div className="password-input-wrap">
                  <input
                    id="reset-confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={values.confirmPassword}
                    onChange={handleChange}
                    className={errors.confirmPassword ? "input-error" : ""}
                    aria-invalid={Boolean(errors.confirmPassword)}
                    aria-describedby={
                      errors.confirmPassword
                        ? "reset-confirm-password-error"
                        : undefined
                    }
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() =>
                      setShowConfirmPassword((current) => !current)
                    }
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showConfirmPassword ? (
                      <FiEyeOff aria-hidden="true" />
                    ) : (
                      <FiEye aria-hidden="true" />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <span
                    id="reset-confirm-password-error"
                    className="field-error"
                  >
                    {errors.confirmPassword}
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
                    Updating...
                  </>
                ) : (
                  "Reset password"
                )}
              </button>
            </form>
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
