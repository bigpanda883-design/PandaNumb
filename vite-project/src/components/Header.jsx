import { useState } from "react";
import { FiMoon, FiSun, FiMenu, FiX } from "react-icons/fi";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "../context/themeStore";
import "../CSS/Header.css";

const navLinks = [
  { label: "Home", to: "/" },
  { label: "How It Works", to: "/#how-it-works", sectionId: "how-it-works" },
  { label: "Services", to: "/#services", sectionId: "services" },
  { label: "Pricing", to: "/#pricing", sectionId: "pricing" },
  { label: "FAQ", to: "/#faq", sectionId: "faq" },
  { label: "Help", to: "/#help", sectionId: "help" },
];

const Navbar = () => {
  const { isDarkMode, toggleTheme } = useTheme();
  const { pathname, hash } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Highlight the item that matches the current URL. Section links own the
  // hash, so "Home" is only active on the landing page with no hash.
  const activeLabel = navLinks.find((link) =>
    link.sectionId
      ? hash === `#${link.sectionId}`
      : pathname === "/" && !hash,
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
