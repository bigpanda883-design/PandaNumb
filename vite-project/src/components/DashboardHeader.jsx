import { useEffect, useState } from "react";
import { FiBell, FiMenu, FiMoon, FiSun } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import {
  getAuthToken,
  getAuthUser,
  handleSessionExpired,
  setAuthUser,
} from "../auth/authStorage";
import { useTheme } from "../context/themeStore";
import { useNotifications } from "../hooks/useNotifications";
import { fetchCurrentUser } from "../services/apiClient";
import "../CSS/dashboard/components/DashboardHeader.css";

function DashboardHeader({ onMenuToggle }) {
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();
  const [user, setUser] = useState(getAuthUser);
  const firstName = user?.fullName?.split(" ")[0] || "Big";
  // Live unread count straight from the notification store - never hardcoded.
  const { unreadCount } = useNotifications();

  useEffect(() => {
    if (user || !getAuthToken()) return undefined;
    let active = true;

    fetchCurrentUser()
      .then((currentUser) => {
        if (!active || !currentUser) return;
        setAuthUser(currentUser);
        setUser(currentUser);
      })
      .catch((error) => {
        if (!active) return;
        if (error?.status === 401) {
          handleSessionExpired();
          navigate("/login", { replace: true });
          return;
        }
        console.error("[auth] failed to load the current user:", error);
      });

    return () => {
      active = false;
    };
  }, [navigate, user]);

  return (
    <header className="dashboard-header">
      <div className="dashboard-header-left">
        <button
          type="button"
          className="dashboard-menu-button"
          aria-label="Open navigation"
          onClick={onMenuToggle}
        >
          <FiMenu size={22} aria-hidden="true" />
        </button>
        <div>
          <span className="dashboard-header-kicker">Good morning,</span>
          <strong>Hi, {firstName}</strong>
        </div>
      </div>
      <div className="dashboard-header-actions">
        <button
          className="dashboard-icon-button"
          aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          onClick={toggleTheme}
        >
          {isDarkMode ? <FiSun /> : <FiMoon />}
        </button>
        <button
          className="dashboard-icon-button"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          onClick={() => navigate("/notifications")}
        >
          <FiBell />
          {unreadCount > 0 && (
            <span className="dashboard-notification-badge" aria-hidden="true">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
        <button
          className="dashboard-avatar"
          aria-label="User profile"
          onClick={() => navigate("/profile")}
        >
          {user?.initials || "BP"}
        </button>
      </div>
    </header>
  );
}

export default DashboardHeader;
