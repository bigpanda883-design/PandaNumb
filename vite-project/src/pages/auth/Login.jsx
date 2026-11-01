import { useState } from "react";
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
import { authenticateLocalAccount } from "../../auth/authStorage";
import { pushNotification } from "../../notifications/notificationStore";
import { useTheme } from "../../context/themeStore";
import {
  getApiBaseUrl,
  isApiOnFrontendHost,
  isBackendUnavailable,
  requestJson,
} from "../../services/httpClient";
import "../../CSS/auth/Login.css";

const initialValues = {
  email: "",
  password: "",
  remember: false,
};

function Login() {
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mobile Popup / Toast notification state
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "error",
  });

  const triggerToast = (message, type = "error") => {
    setToast({ show: true, message, type });
    window.setTimeout(() => {
      setToast({ show: false, message: "", type: "error" });
    }, 4500);
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setValues((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
    setErrors((current) => ({ ...current, [name]: "" }));
  };

  // Strong Validation Routine
  const validate = () => {
    const nextErrors = {};
    const trimmedEmail = values.email.trim();

    // Email Validation
    if (!trimmedEmail) {
      nextErrors.email = "Email address is required.";
    } else if (
      !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmedEmail)
    ) {
      nextErrors.email =
        "Please enter a valid email address (e.g. name@domain.com).";
    }

    // Password Validation
    if (!values.password) {
      nextErrors.password = "Password is required.";
    } else {
      if (values.password.length < 8) {
        nextErrors.password = "Password must be at least 8 characters long.";
      } else if (!/(?=.*[A-Z])/.test(values.password)) {
        nextErrors.password =
          "Password must contain at least one uppercase letter (A-Z).";
      } else if (!/(?=.*\d)/.test(values.password)) {
        nextErrors.password =
          "Password must contain at least one number (0-9).";
      } else if (!/(?=.*[@$!%*?&])/.test(values.password)) {
        nextErrors.password =
          "Password must contain at least one special character (@$!%*?&).";
      }
    }

    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validate();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);

      // Trigger Mobile Pop-up / Toast Alert on first error found
      const firstErrorMessage = Object.values(nextErrors)[0];
      triggerToast(firstErrorMessage, "error");
      return;
    }

    setIsSubmitting(true);

    try {
      let user;
      let token = "";

      try {
        // Prefer the real server. requestJson reads the body defensively, so an
        // empty response (proxy down, offline phone, static host) produces a
        // readable message instead of "Unexpected end of JSON input".
        //
        // `operation` names the call in the failure text, and the request goes
        // to the CONFIGURED API host (VITE_API_BASE_URL -> Render in
        // production), never to the static frontend host.
        const payload = await requestJson("/api/auth/login", {
          method: "POST",
          operation: "login",
          body: {
            email: values.email.trim(),
            password: values.password,
          },
        });

        if (!payload?.user) {
          throw new Error("The server returned an invalid login response.");
        }

        // A server session without a token cannot authenticate anything; the
        // next page load would look signed out, which is the "session lost"
        // symptom. Treat it as a failed login instead of a half-session.
        if (!payload.token) {
          throw new Error(
            "The server did not return a session token. Please try again.",
          );
        }

        user = payload.user;
        token = payload.token;
      } catch (error) {
        // Only a backend that is genuinely unreachable or not our API may use
        // the on-device account book. A real 401 (wrong password) or 429 stays
        // an error, and a deployment pointed at the FRONTEND host is reported as
        // such instead of silently signing in from stale local data - that
        // "local login" is why a phone could appear to log in while talking to
        // no server at all.
        if (!isBackendUnavailable(error) || isApiOnFrontendHost()) {
          // A mis-pointed API is a deployment fault, not a rejected password.
          //
          // THE OLD MESSAGE BLAMED THE WRONG HOST: it always said the request
          // "went to the website host", even when VITE_API_URL pointed at a
          // backend that did not resolve (a wrong Render service name). The
          // person then went looking at Vercel and found nothing wrong. Name the
          // URL that was actually called, and what came back, so the fix is
          // obvious from the message itself.
          if (isBackendUnavailable(error)) {
            const base = getApiBaseUrl();
            const target = base
              ? `${base}/api/auth/login`
              : `${window.location.origin}/api/auth/login`;
            throw new Error(
              base
                ? `Cannot reach the sign-in server at ${target}. ` +
                    `The backend did not respond (${error?.status || "no response"}). ` +
                    "Check that the backend is running and that VITE_API_URL on the hosting dashboard points to it."
                : "This build has no API URL configured, so the sign-in request went to the website host instead of the API. " +
                    "Set VITE_API_URL on the hosting dashboard and redeploy.",
              { cause: error },
            );
          }
          throw error;
        }

        const local = await authenticateLocalAccount({
          email: values.email.trim(),
          password: values.password,
        });

        if (!local.ok) {
          throw new Error(local.message, { cause: error });
        }

        user = local.user;
      }

      const fullName =
        user.fullName ||
        user.name ||
        values.email.split("@")[0] ||
        "Panda User";
      const email = user.email || values.email.trim();
      const phone = user.phone || "";

      // The user record and the token are written together, so a browser that
      // had a different account signed in cannot end up "logged in without a
      // token" (which made every protected request fail with 401).
      const saved = saveSession(
        {
          fullName,
          email,
          phone,
          initials: fullName.slice(0, 2).toUpperCase(),
        },
        token,
      );

      if (!saved) {
        throw new Error(
          "This browser is blocking site data, so the session cannot be saved. Enable site data and try again.",
        );
      }

      pushNotification({
        type: "security",
        title: "New sign-in",
        description: "Your account was accessed from a new session.",
        path: "/security",
      });

      triggerToast("Sign in successful! Redirecting...", "success");

      setTimeout(() => {
        navigate("/dashboard", { replace: true });
      }, 500);
    } catch (error) {
      triggerToast(
        error?.message || "An unexpected error occurred. Please try again.",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      {/* Mobile Pop-up Alert Banner */}
      {toast.show && (
        <div
          className={`auth-mobile-popup ${toast.type}`}
          role="alert"
          aria-live="assertive"
        >
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

      {/* Left Branding Panel */}
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

      {/* Right Form Panel */}
      <div className="auth-right-panel">
        <div className="auth-form-wrapper">
          <div className="auth-top-bar">
            <Link className="auth-back-link" to="/">
              <FiArrowLeft aria-hidden="true" />
              Back to home
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

          {/* Toggle Switch */}
          <div className="auth-tabs">
            <Link to="/login" className="auth-tab active">
              Login
            </Link>
            <Link to="/signup" className="auth-tab">
              Create Account
            </Link>
          </div>

          <div className="auth-heading">
            <h1>Welcome back</h1>
            <p>Sign in to your wallet and numbers.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="field-group">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={handleChange}
                className={errors.email ? "input-error" : ""}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={
                  errors.email ? "login-email-error" : undefined
                }
                placeholder="you@example.com"
              />
              {errors.email && (
                <span id="login-email-error" className="field-error">
                  {errors.email}
                </span>
              )}
            </div>

            <div className="field-group">
              <label htmlFor="login-password">Password</label>
              <div className="password-input-wrap">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={values.password}
                  onChange={handleChange}
                  className={errors.password ? "input-error" : ""}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password ? "login-password-error" : undefined
                  }
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <FiEyeOff aria-hidden="true" />
                  ) : (
                    <FiEye aria-hidden="true" />
                  )}
                </button>
              </div>
              {errors.password && (
                <span id="login-password-error" className="field-error">
                  {errors.password}
                </span>
              )}
            </div>

            <div className="auth-actions-row">
              <label className="checkbox-label">
                <input
                  name="remember"
                  type="checkbox"
                  checked={values.remember}
                  onChange={handleChange}
                />
                <span>Remember me</span>
              </label>

              {/* There is no self-service reset flow yet, so this opens the
                  support mailbox that the Footer and Help Center also use. */}
              <Link to="/forgot-password" className="auth-inline-link">
                Forgot password?
              </Link>
            </div>

            <button
              className="auth-submit"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <FiLoader className="loading-icon" aria-hidden="true" />{" "}
                  Signing in...
                </>
              ) : (
                "Login"
              )}
            </button>
          </form>

          <p className="auth-switch">
            New to Panda Numbers? <Link to="/signup">Create one</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default Login;
