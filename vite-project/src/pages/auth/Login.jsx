import { useState } from "react";
import { FiArrowLeft, FiEye, FiEyeOff, FiLoader, FiMoon, FiSun } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { setAuthUser } from "../../auth/authStorage";
import { useTheme } from "../../context/ThemeContext";
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

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setValues((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
    setErrors((current) => ({ ...current, [name]: "" }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!values.email.trim()) nextErrors.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!values.password) nextErrors.password = "Enter your password.";
    else if (values.password.length < 8) {
      nextErrors.password = "Your password must be at least 8 characters.";
    }
    return nextErrors;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    window.setTimeout(() => {
      const name = values.email.split("@")[0] || "Panda User";
      setAuthUser({
        fullName: name,
        email: values.email,
        phone: "09132490567",
        initials: name.slice(0, 2).toUpperCase(),
      });
      navigate("/dashboard", { replace: true });
    }, 350);
  };

  return (
    <main className="auth-page">
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

              <a href="#forgot-password" className="auth-inline-link">
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
