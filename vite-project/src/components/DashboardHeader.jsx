import { FiBell, FiMoon, FiSun } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { getAuthUser } from "../auth/authStorage";
import { useTheme } from "../context/ThemeContext";
import "../CSS/dashboard/components/DashboardHeader.css";

function DashboardHeader() {
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();
  const user = getAuthUser();
  const firstName = user?.fullName?.split(" ")[0] || "Big";

  return (
    <header className="dashboard-header">
      <div className="dashboard-header-left">
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
          aria-label="Notifications"
          onClick={() => navigate("/notifications")}
        >
          <FiBell />
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
