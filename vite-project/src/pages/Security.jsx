import { useState } from "react";
import { FiShield, FiEye, FiEyeOff, FiKey } from "react-icons/fi";
import { getAuthUser, saveSession } from "../auth/authStorage";
import { pushNotification } from "../notifications/notificationStore";
import { changeUserPassword } from "../services/apiClient";
import { usePageLoading } from "../hooks/usePageLoading";
import { SecuritySkeleton } from "../components/skeleton/PageSkeletons";
import "../CSS/dashboard/pages/Security.css";

const Security = () => {
  const [showPassword, setShowPassword] = useState(false);
  const { isLoading } = usePageLoading();
  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.newPassword !== formData.confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const result = await changeUserPassword({
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
      });
      const sessionSaved = saveSession(result.user || getAuthUser(), result.token);
      setFormData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      pushNotification({
        type: "security",
        title: "Password changed",
        description:
          "Your account password was updated. If this was not you, contact support.",
        path: "/security",
      });
      setSuccess(
        sessionSaved
          ? "Your password was changed. Other signed-in sessions were logged out."
          : "Your password was changed, but this device could not save the new session. Please sign in again.",
      );
    } catch (requestError) {
      setError(requestError.message || "Unable to change your password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <SecuritySkeleton />;

  return (
    <div className="security-page">
      <header className="security-header">
        <h1>Security</h1>
        <p>Keep your account protected.</p>
      </header>

      {/* SINGLE MAIN CARD CONTAINER */}
      <div className="security-card">
        {/* TOP BANNER */}
        <div className="security-banner">
          <div className="banner-icon-wrapper">
            <FiShield className="banner-icon" />
          </div>
          <div className="banner-info">
            <h2>Account security</h2>
            <p>
              Change your password anytime. We never show or store your password
              in Panda Numbers.
            </p>
          </div>
        </div>

        {/* PASSWORD FORM */}
        <form onSubmit={handleSubmit} className="security-form">
          {error && (
            <p className="security-form-message error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="security-form-message success" role="status">
              {success}
            </p>
          )}
          <div className="form-group">
            <label htmlFor="currentPassword">Current password</label>
            <input
              type={showPassword ? "text" : "password"}
              id="currentPassword"
              name="currentPassword"
              value={formData.currentPassword}
              onChange={handleChange}
              autoComplete="current-password"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">New password</label>
            <input
              type={showPassword ? "text" : "password"}
              id="newPassword"
              name="newPassword"
              value={formData.newPassword}
              onChange={handleChange}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input
              type={showPassword ? "text" : "password"}
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          {/* BOTTOM CONTROLS ROW */}
          <div className="form-actions-row">
            <button
              type="button"
              className="toggle-password-btn"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
              <span>Show current and new password</span>
            </button>

            <button
              type="submit"
              className="change-password-btn"
              disabled={isSubmitting}
            >
              <FiKey />
              <span>{isSubmitting ? "Changing..." : "Change password"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Security;
