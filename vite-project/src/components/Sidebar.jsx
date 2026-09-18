import {
  FiGrid,
  FiSmartphone,
  FiCreditCard,
  FiRepeat,
  FiUser,
  FiBell,
  FiHelpCircle,
  FiMessageSquare,
  FiShield,
  FiLogOut,
  FiX,
} from "react-icons/fi";
import { NavLink, useNavigate } from "react-router-dom";
import { clearAuthUser } from "../auth/authStorage";
import "../CSS/dashboard/components/Sidebar.css";

const mainItems = [
  ["Home", "/dashboard", FiGrid],
  ["Buy", "/buy", FiSmartphone],
  ["My Numbers", "/my-numbers", FiCreditCard],
  ["Transactions", "/transactions", FiRepeat],
  ["Profile", "/profile", FiUser],
];

const moreItems = [
  ["Deposit", "/deposit", FiCreditCard],
  ["Notifications", "/notifications", FiBell],
  ["Help Center", "/help-center", FiHelpCircle],
  ["Active SMS", "/active-sms", FiMessageSquare],
  ["Security", "/security", FiShield],
];

function Sidebar({ isOpen, onClose }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAuthUser();
    navigate("/login", { replace: true });
  };

  const renderItems = (items) =>
    items.map(([label, to, Icon]) => (
      <NavLink
        key={to}
        to={to}
        end={to === "/dashboard"}
        className={({ isActive }) =>
          `dashboard-nav-item${isActive ? " active" : ""}`
        }
        onClick={onClose}
      >
        <Icon className="nav-icon" aria-hidden="true" />
        <span>{label}</span>
      </NavLink>
    ));

  return (
    <>
      {isOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}
      <aside className={`dashboard-sidebar${isOpen ? " open" : ""}`}>
        {/* BRAND HEADER */}
        <div className="sidebar-brand-row">
          <NavLink
            className="dashboard-brand"
            to="/dashboard"
            onClick={onClose}
          >
            <div className="brand-logo-square">
              <span className="brand-logo-p">P</span>
              <span className="brand-logo-dot"></span>
            </div>
            <div className="brand-text">
              <span className="brand-name-dark">Panda </span>
              <span className="brand-name-blue">Numbers</span>
            </div>
          </NavLink>
          <button
            className="sidebar-close"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <FiX />
          </button>
        </div>

        {/* NAVIGATION ITEMS */}
        <nav className="dashboard-nav" aria-label="Dashboard navigation">
          <div className="nav-group">{renderItems(mainItems)}</div>

          <span className="dashboard-nav-label">MORE</span>
          <div className="nav-group">{renderItems(moreItems)}</div>
        </nav>

        {/* LOGOUT BUTTON */}
        <button className="dashboard-logout" onClick={handleLogout}>
          <FiLogOut className="nav-icon" aria-hidden="true" />
          <span>Log out</span>
        </button>
      </aside>
    </>
  );
}

export default Sidebar;
