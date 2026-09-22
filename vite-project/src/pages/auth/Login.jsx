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
import { setAuthUser } from "../../auth/authStorage";
import { useTheme } from "../../context/themeStore";
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
      // Simulate API call processing safely
      await new Promise((resolve) => setTimeout(resolve, 800));

      const name = values.email.split("@")[0] || "Panda User";
      setAuthUser({
        fullName: name,
        email: values.email.trim(),
        phone: "09132490567",
        initials: name.slice(0, 2).toUpperCase(),
      });

      triggerToast("Sign in successful! Redirecting...", "success");

      setTimeout(() => {
        navigate("/dashboard", { replace: true });
      }, 500);
    } catch {
      triggerToast("An unexpected error occurred. Please try again.", "error");
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      {/* Mobile Pop-up Alert Banner */}
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
              <a
                href="mailto:Bigpanda883@gmail.com?subject=Panda%20Numbers%20password%20reset"
                className="auth-inline-link"
              >
                Forgot password?
              </a>
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
