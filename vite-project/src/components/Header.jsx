import { useState } from "react";
import { FiMoon, FiSun, FiMenu, FiX } from "react-icons/fi";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "../context/themeStore";
import "../CSS/Header.css";

// Every item points at a section that already exists on the landing page, so
// nothing here creates a duplicate section. `sectionId` is used both for the
// scroll target and to decide which item is highlighted in the header.
const navLinks = [
  { label: "Home", to: "/#home", sectionId: "home" },
  { label: "Buy Number", to: "/buy", sectionId: "buy" },
  { label: "How It Works", to: "/#how-it-works", sectionId: "how-it-works" },
  { label: "Services", to: "/#services", sectionId: "services" },
  { label: "Pricing", to: "/#pricing", sectionId: "pricing" },
  { label: "FAQ", to: "/#faq", sectionId: "faq" },
  { label: "Help", to: "/#help", sectionId: "help", fallback: "help" },
];

const Navbar = () => {
  const { isDarkMode, toggleTheme } = useTheme();
  const { pathname, hash } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Never leave the mobile menu hanging open behind the next page. Resetting
  // during render (instead of in an effect) avoids the extra cascading render
  // React would otherwise do. See
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [lastLocationKey, setLastLocationKey] = useState(`${pathname}${hash}`);
  if (lastLocationKey !== `${pathname}${hash}`) {
    setLastLocationKey(`${pathname}${hash}`);
    setMobileMenuOpen(false);
  }

  // Highlight the item that matches the current URL. "Home" is also active on
  // the landing page with no hash at all, since that is its scroll target.
  const activeLabel = navLinks.find((link) =>
    hash
      ? hash === `#${link.sectionId}` || hash === `#${link.fallback}`
      : pathname === "/"
        ? link.label === "Home"
        : pathname === link.to && link.label === "Buy Number",
  )?.label;

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="panda-header">
      <div className="panda-header-container">
        <Link className="panda-logo" to="/" aria-label="Panda Numbers home">
          <div className="logo-icon">
            <span className="logo-p">P</span>
            <span className="logo-dot"></span>
          </div>
          <div className="logo-text">
            <span className="text-black">Panda</span>
            <span className="text-blue"> Numbers</span>
          </div>
        </Link>

        <nav
          className={`panda-nav ${mobileMenuOpen ? "mobile-open" : ""}`}
          aria-label="Main navigation"
        >
          {navLinks.map((link) => (
            <Link
              key={link.label}
              to={link.to}
              className={`nav-item ${activeLabel === link.label ? "active" : ""}`}
              onClick={closeMobileMenu}
            >
              {link.label}
            </Link>
          ))}
          <div className="mobile-actions">
            <Link className="sign-in-btn" to="/login" onClick={closeMobileMenu}>
              Sign in
            </Link>
            <Link
              className="get-started-btn"
              to="/signup"
              onClick={closeMobileMenu}
            >
              Get Started
            </Link>
          </div>
        </nav>

        <div className="desktop-actions">
          <button
            className="theme-toggle-btn"
            type="button"
            aria-label={
              isDarkMode ? "Switch to light mode" : "Switch to dark mode"
            }
            onClick={toggleTheme}
          >
            {isDarkMode ? <FiSun size={18} /> : <FiMoon size={18} />}
          </button>
          <Link className="sign-in-btn" to="/login">
            Sign in
          </Link>
          <Link className="get-started-btn" to="/signup">
            Get Started
          </Link>
        </div>

        <button
          className="mobile-toggle-icon"
          type="button"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
        </button>
      </div>
    </header>
  );
};

export default Navbar;
