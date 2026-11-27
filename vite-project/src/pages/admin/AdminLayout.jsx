/**
 * Shared admin console layout.
 *
 * Every /admin/* route renders inside this shell, so the sidebar, branding,
 * header, profile menu, notification bell, theme toggle and mobile drawer are
 * built ONCE and can never drift between pages.
 *
 * Styling contract:
 *   - AdminShell.css      owns everything here (sidebar, header, content frame,
 *                         dark-mode variables).
 *   - Each page imports its own stylesheet and adds its page-root class
 *                         (e.g. `admin-users-page`) so page CSS cannot leak.
 *
 * Theme:
 *   - The shared ThemeProvider (html[data-theme]) is the single source of truth,
 *     so the admin theme is the same one the public site and customer dashboard
 *     use, and it is restored after a refresh or a later sign-in.
 *   - The choice is also saved to the admin account through the existing
 *     saveAdminPreferences endpoint (best effort - the UI already switched).
 */
import { useCallback, useEffect, useState } from "react";
import {
  FiActivity,
  FiBell,
  FiChevronDown,
  FiCreditCard,
  FiGrid,
  FiHelpCircle,
  FiLogOut,
  FiMenu,
  FiMoon,
  FiSettings,
  FiShield,
  FiShoppingBag,
  FiSun,
  FiTag,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearAuthUser, getAuthUser } from "../../auth/authStorage";
import { useTheme } from "../../context/themeStore";
import usePresenceSync from "../../hooks/usePresenceSync";
import {
  fetchAdminSettings,
  fetchNotifications,
  logoutUser,
  saveAdminPreferences,
} from "../../services/apiClient";
// Shared shell layout + page primitives. Every admin page imports this too,
// then its own page stylesheet.
import "../../CSS/dashboard/admin/admin.css";

export const MAIN_NAVIGATION = [
  { label: "Dashboard", path: "/admin/dashboard", Icon: FiGrid },
  { label: "Users", path: "/admin/users", Icon: FiUsers },
  { label: "Purchases", path: "/admin/purchases", Icon: FiShoppingBag },
  { label: "Transactions", path: "/admin/transactions", Icon: FiActivity },
  { label: "Numbers Inventory", path: "/admin/inventory", Icon: FiTag },
  { label: "Wallet & Payments", path: "/admin/payments", Icon: FiCreditCard },
];

const MANAGEMENT_NAVIGATION = [
  { label: "Admin & Staff", path: "/admin/staff", Icon: FiShield },
  { label: "Announcements", path: "/admin/announcements", Icon: FiBell },
  { label: "Support Tickets", path: "/admin/support", Icon: FiHelpCircle },
];

const SYSTEM_NAVIGATION = [
  { label: "Activity Logs", path: "/admin/activity-logs", Icon: FiActivity },
  { label: "Settings & Security", path: "/admin/settings", Icon: FiSettings },
];

/** Page titles for the header. Longest prefix wins, so /users/:id -> Users. */
const PAGE_TITLES = [
  ["/admin/dashboard", "Dashboard Overview"],
  ["/admin/users", "Users Management"],
  ["/admin/purchases", "Purchases"],
  ["/admin/transactions", "Transactions"],
  ["/admin/inventory", "Numbers Inventory"],
  ["/admin/payments", "Wallet & Payments"],
  ["/admin/staff", "Admin & Staff"],
  ["/admin/announcements", "Announcements"],
  ["/admin/support", "Support Tickets"],
  ["/admin/activity-logs", "Activity Logs"],
  ["/admin/settings", "Settings & Security"],
  ["/admin/notifications", "Notifications"],
];

function pageTitleFor(pathname) {
  const match = PAGE_TITLES.find(
    ([path]) => pathname === path || pathname.startsWith(`${path}/`),
  );
  return match ? match[1] : "Admin Console";
}

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { theme, toggleTheme } = useTheme();

  // Keeps this admin session marked online, so the users table shows the
  // administrator the same real presence data it shows for customers.
  usePresenceSync();

  const pageTitle = pageTitleFor(location.pathname);

  // The sidebar preference is saved on the account, so a collapsed console
  // stays collapsed for that administrator on any device.
  useEffect(() => {
    let cancelled = false;
    fetchAdminSettings()
      .then((payload) => {
        if (!cancelled)
          setCollapsed(Boolean(payload?.preferences?.sidebarCollapsed));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the theme to the admin account. The ThemeProvider already saved it
  // locally and applied html[data-theme]; this only mirrors it server-side.
  useEffect(() => {
    saveAdminPreferences({ theme }).catch(() => {});
  }, [theme]);

  const loadUnread = useCallback(() => {
    fetchNotifications()
      .then((payload) => setUnreadCount(Number(payload?.unreadCount) || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadUnread();
  }, [loadUnread, location.pathname]);

  // Close the mobile drawer on Escape and whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // Clear the local session regardless of API availability.
    } finally {
      clearAuthUser();
      navigate("/login", { replace: true });
    }
  };

  const shellClass = [
    "admin-dashboard-shell",
    collapsed ? "is-collapsed" : "",
    sidebarOpen ? "is-drawer-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={shellClass} data-page="admin">
      {sidebarOpen && (
        <button
          type="button"
          className="admin-mobile-overlay"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`admin-dashboard-sidebar${sidebarOpen ? " open" : ""}`}
        aria-label="Admin sidebar"
      >
        <div className="admin-side-brand">
          <div className="admin-side-logo">P</div>
          <div className="admin-side-brand-text">
            <strong>Panda Number</strong>
            <span>
              <FiShield aria-hidden="true" /> Admin Panel
            </span>
          </div>
          <button
            type="button"
            className="admin-side-close"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          >
            <FiX />
          </button>
        </div>

        <nav className="admin-side-nav" aria-label="Admin navigation">
          <p>MAIN MENU</p>
          {renderGroup(MAIN_NAVIGATION, () => setSidebarOpen(false))}
          <p>MANAGEMENT</p>
          {renderGroup(MANAGEMENT_NAVIGATION, () => setSidebarOpen(false))}
          <p>SYSTEM</p>
          {renderGroup(SYSTEM_NAVIGATION, () => setSidebarOpen(false))}
        </nav>

        <div className="admin-side-foot">
          <button
            type="button"
            className="admin-side-logout"
            onClick={handleLogout}
            title="Log out"
          >
            <FiLogOut aria-hidden="true" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <section className="admin-dashboard-main">
        <header className="admin-dashboard-header">
          <button
            type="button"
            className="admin-menu-button"
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <FiMenu />
          </button>

          <div className="admin-header-title">
            <span>Admin Console</span>
            <strong>{pageTitle}</strong>
          </div>

          <div className="admin-header-actions">
            <button
              type="button"
              className="admin-header-icon"
              aria-label={
                unreadCount > 0
                  ? `Notifications (${unreadCount} unread)`
                  : "Notifications"
              }
              onClick={() => navigate("/admin/notifications")}
            >
              <FiBell />
              {unreadCount > 0 ? (
                <span>{unreadCount > 9 ? "9+" : unreadCount}</span>
              ) : null}
            </button>

            <button
              type="button"
              className="admin-header-icon"
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              title={theme === "dark" ? "Light mode" : "Dark mode"}
              onClick={toggleTheme}
            >
              {theme === "dark" ? <FiSun /> : <FiMoon />}
            </button>

            <div className="admin-profile">
              <button
                type="button"
                className="admin-profile-button"
                aria-label="Administrator profile"
                aria-haspopup="menu"
                onClick={() => navigate("/admin/settings")}
                data-initials={initials(getAuthUser()?.fullName)}
              >
                <span className="admin-profile-name">
                  {initials(getAuthUser()?.fullName)}
                </span>
                <FiChevronDown aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <div className="admin-dashboard-content">
          <Outlet />
        </div>
      </section>
    </main>
  );
}

function renderGroup(items, onNavigate) {
  return items.map(({ label, path, Icon }) => (
    <NavLink
      key={path}
      to={path}
      className={({ isActive }) =>
        `admin-side-item${isActive ? " active" : ""}`
      }
      onClick={onNavigate}
      title={label}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  ));
}

function initials(name) {
  const value = String(name || "Admin").trim();
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AD";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default AdminLayout;
