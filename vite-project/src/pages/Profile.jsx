import { useState } from "react";
import { FiLifeBuoy, FiLogOut } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import {
  clearAuthUser,
  getAuthToken,
  getAuthUser,
  saveSession,
} from "../auth/authStorage";
import { logoutUser, updateUserProfile } from "../services/apiClient";
import { pushNotification } from "../notifications/notificationStore";
import { usePageLoading } from "../hooks/usePageLoading";
import { ProfileSkeleton } from "../components/skeleton/PageSkeletons";
import "../CSS/dashboard/pages/Profile.css";

function Profile() {
  const navigate = useNavigate();
  const user = getAuthUser();
  const { isLoading } = usePageLoading();

  const [formData, setFormData] = useState({
    fullName: user?.fullName || "",
    email: user?.email || "",
    phoneNumber: user?.phone || "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Calculate initials from Full Name
  const getInitials = (name) => {
    if (!name) return "PN";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (
      parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
    ).toUpperCase();
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      const updatedUser = await updateUserProfile({
        fullName: formData.fullName.trim(),
        phone: formData.phoneNumber.trim(),
      });
      if (!updatedUser || !saveSession(updatedUser, getAuthToken())) {
        setError(
          "Your profile was updated, but this device could not save the latest account details. Please refresh.",
        );
        return;
      }

      setFormData({
        fullName: updatedUser.fullName || "",
        email: updatedUser.email || "",
        phoneNumber: updatedUser.phone || "",
      });
      setSuccess("Your profile changes were saved.");
      pushNotification({
        type: "security",
        title: "Profile updated",
        description: "Your account details were changed.",
        path: "/profile",
      });
    } catch (requestError) {
      setError(requestError.message || "Unable to update your profile.");
    } finally {
      setIsSaving(false);
    }
  };

  // Support already has a home in the app — send people there instead of
  // showing a dead end.
  const handleSupportClick = () => {
    navigate("/help-center");
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // Always clear the local session if the server cannot be reached.
    } finally {
      clearAuthUser();
      navigate("/login", { replace: true });
    }
  };

  if (isLoading) return <ProfileSkeleton />;

  return (
    <section className="profile-page-container">
      <div className="profile-header">
        <h1>Profile</h1>
        <p>Your account details and preferences.</p>
      </div>

      <div className="profile-content-wrapper">
        {/* User Badge Card */}
        <div className="profile-card user-info-card">
          <div className="avatar-circle">{getInitials(formData.fullName)}</div>
          <div className="user-details">
            <span className="user-name">{formData.fullName}</span>
            <span className="user-email">{formData.email}</span>
          </div>
        </div>

        {/* Form Card */}
        <div className="profile-card profile-form-card">
          <form onSubmit={handleSubmit} className="profile-form">
            {error && (
              <p className="profile-form-message error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="profile-form-message success" role="status">
                {success}
              </p>
            )}
            <div className="form-group">
              <label htmlFor="fullName">Full name</label>
              <input
                type="text"
                id="fullName"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Enter your full name"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="phoneNumber">Phone number</label>
              <input
                type="tel"
                id="phoneNumber"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleChange}
                placeholder="Enter your phone number"
                required
              />
            </div>

            <button
              type="submit"
              className="save-changes-btn"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save changes"}
            </button>
          </form>
        </div>

        {/* Support Card Button */}
        <button
          type="button"
          className="profile-card action-card support-card"
          onClick={handleSupportClick}
        >
          <FiLifeBuoy className="action-icon" />
          <span>Contact support</span>
        </button>

        {/* Logout Card Button */}
        <button
          type="button"
          className="profile-card action-card logout-card"
          onClick={handleLogout}
        >
          <FiLogOut className="action-icon red-icon" />
          <span>Log out</span>
        </button>
      </div>
    </section>
  );
}

export default Profile;
