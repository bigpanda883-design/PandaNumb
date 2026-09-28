import { useState } from "react";
import { FiShield, FiEye, FiEyeOff, FiKey } from "react-icons/fi";
import { pushNotification } from "../notifications/notificationStore";
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.newPassword !== formData.confirmPassword) {
      alert("New passwords do not match!");
      return;
    }
    // Handle change password logic
    console.log("Password change requested", formData);

    // Security changes are important account activity - always notify.
    pushNotification({
      type: "security",
      title: "Password changed",
      description:
        "Your account password was updated. If this was not you, contact support.",
      path: "/security",
    });

    setFormData({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
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
          <div className="form-group">
            <label htmlFor="currentPassword">Current password</label>
            <input
              type={showPassword ? "text" : "password"}
              id="currentPassword"
              name="currentPassword"
              value={formData.currentPassword}
              onChange={handleChange}
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

            <button type="submit" className="change-password-btn">
              <FiKey />
              <span>Change password</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Security;
