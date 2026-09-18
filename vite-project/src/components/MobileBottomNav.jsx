import { NavLink } from "react-router-dom";
import {
  FiCreditCard,
  FiGrid,
  FiRepeat,
  FiSmartphone,
  FiUser,
} from "react-icons/fi";
import "../CSS/dashboard/components/MobileBottomNav.css";

const navItems = [
  { label: "Home", to: "/dashboard", icon: FiGrid },
  { label: "Buy", to: "/buy", icon: FiSmartphone },
  { label: "My Numbers", to: "/my-numbers", icon: FiCreditCard },
  { label: "Transactions", to: "/transactions", icon: FiRepeat },
  { label: "Profile", to: "/profile", icon: FiUser },
];

const MobileBottomNav = () => {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
      {navItems.map(({ label, to, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/dashboard"}
          className={({ isActive }) =>
            `mobile-nav-item${isActive ? " active" : ""}`
          }
        >
          <div className="icon-pill">
            <Icon className="mobile-nav-icon" aria-hidden="true" />
          </div>
          <span className="mobile-nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default MobileBottomNav;
