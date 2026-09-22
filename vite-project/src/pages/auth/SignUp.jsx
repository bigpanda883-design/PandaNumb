import { useState } from "react";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiEye,
  FiEyeOff,
  FiLoader,
  FiMoon,
  FiSun,
} from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { setAuthUser } from "../../auth/authStorage";
import { pushNotification } from "../../notifications/notificationStore";
import { useTheme } from "../../context/themeStore";
import "../../CSS/auth/SignUp.css";

const initialValues = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

function SignUp() {
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [visibleFields, setVisibleFields] = useState({
    password: false,
    confirmPassword: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  };

  const validate = () => {
    const nextErrors = {};

    // 1. Full Name Validation
    const nameTrimmed = values.fullName.trim();
    if (!nameTrimmed) {
      nextErrors.fullName = "Enter your full name.";
    } else if (nameTrimmed.length < 2) {
      nextErrors.fullName = "Name must be at least 2 characters.";
    } else if (!/^[a-zA-Z\s'-]+$/.test(nameTrimmed)) {
      nextErrors.fullName = "Name contains invalid characters.";
    }

    // 2. Email Validation
    const emailTrimmed = values.email.trim();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailTrimmed) {
      nextErrors.email = "Enter your email address.";
    } else if (!emailRegex.test(emailTrimmed)) {
      nextErrors.email = "Enter a valid email address.";
    }

    // 3. Phone Validation
    const phoneTrimmed = values.phone.trim();
    const phoneRegex = /^\+?[0-9\s-]{7,15}$/;
    if (!phoneTrimmed) {
      nextErrors.phone = "Enter your phone number.";
    } else if (!phoneRegex.test(phoneTrimmed)) {
      nextErrors.phone = "Enter a valid phone number.";
    }

    // 4. Strong Password Validation
    // Requires: Min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special character
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!values.password) {
      nextErrors.password = "Create a password.";
    } else if (values.password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    } else if (!passwordRegex.test(values.password)) {
      nextErrors.password =
        "Password must contain uppercase, lowercase, number, and special character (@$!%*?&).";
    }

    // 5. Confirm Password Validation
    if (!values.confirmPassword) {
      nextErrors.confirmPassword = "Confirm your password.";
    } else if (values.confirmPassword !== values.password) {
      nextErrors.confirmPassword = "Passwords do not match.";
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

    // Save auth state
    setAuthUser({
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      initials: values.fullName
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    });

    // Welcome the new account with its first notification.
    pushNotification({
      type: "security",
      title: "Welcome to Panda Numbers",
      description: "Your account was created successfully.",
      path: "/security",
    });

    // Show Success Modal
    setShowSuccessModal(true);

    // Redirect after exactly 1 second
    window.setTimeout(() => {
      navigate("/dashboard", { replace: true });
    }, 1000);
  };

  const toggleVisibility = (field) => {
    setVisibleFields((current) => ({ ...current, [field]: !current[field] }));
  };

  return (
    <main className="auth-page">
      {/* Success Modal Popup */}
      {showSuccessModal && (
        <div className="auth-modal-overlay">
          <div className="auth-modal">
            <FiCheckCircle className="modal-icon" />
            <h2>Account Created!</h2>
            <p>Welcome aboard, redirecting to your dashboard...</p>
          </div>
        </div>
      )}

      {/* Left Blue Panel */}
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
            Balances and prices are always verified on our server.
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

          {/* Switcher / Tabs */}
          <div className="auth-tabs">
            <Link to="/login" className="auth-tab">
              Login
            </Link>
            <span className="auth-tab active">Create Account</span>
          </div>

          <div className="auth-heading">
            <h1>Create your account</h1>
            <p>It takes less than a minute to get started.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {/* Full Name */}
            <div className="field-group">
              <label htmlFor="signup-name">Full name</label>
              <input
                id="signup-name"
                name="fullName"
                type="text"
                autoComplete="name"
                value={values.fullName}
                onChange={handleChange}
                aria-invalid={Boolean(errors.fullName)}
                placeholder="Amaka Okafor"
              />
              {errors.fullName && (
                <span className="field-error">{errors.fullName}</span>
              )}
            </div>

            {/* Email */}
            <div className="field-group">
              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={handleChange}
                aria-invalid={Boolean(errors.email)}
                placeholder="you@example.com"
              />
              {errors.email && (
                <span className="field-error">{errors.email}</span>
              )}
            </div>

            {/* Phone Number */}
            <div className="field-group">
              <label htmlFor="signup-phone">Phone number</label>
              <input
                id="signup-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={values.phone}
                onChange={handleChange}
                aria-invalid={Boolean(errors.phone)}
                placeholder="0803 000 0000"
              />
              {errors.phone && (
                <span className="field-error">{errors.phone}</span>
              )}
            </div>

            {/* Password */}
            <div className="field-group">
              <label htmlFor="signup-password">Password</label>
              <div className="password-input-wrap">
                <input
                  id="signup-password"
                  name="password"
                  type={visibleFields.password ? "text" : "password"}
                  autoComplete="new-password"
                  value={values.password}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.password)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => toggleVisibility("password")}
                  aria-label={
                    visibleFields.password ? "Hide password" : "Show password"
                  }
                >
                  {visibleFields.password ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
              {errors.password && (
                <span className="field-error">{errors.password}</span>
              )}
            </div>

            {/* Confirm Password */}
            <div className="field-group">
              <label htmlFor="signup-confirm-password">Confirm password</label>
              <div className="password-input-wrap">
                <input
                  id="signup-confirm-password"
                  name="confirmPassword"
                  type={visibleFields.confirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={values.confirmPassword}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.confirmPassword)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => toggleVisibility("confirmPassword")}
                  aria-label={
                    visibleFields.confirmPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {visibleFields.confirmPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
              {errors.confirmPassword && (
                <span className="field-error">{errors.confirmPassword}</span>
              )}
            </div>

            <button
              className="auth-submit"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <FiLoader className="loading-icon" aria-hidden="true" />
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default SignUp;
