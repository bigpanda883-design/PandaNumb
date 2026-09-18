import { useState } from "react";
import { FiMoon, FiSun, FiMenu, FiX } from "react-icons/fi";
import { Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import "../CSS/Header.css";

const Navbar = () => {
  const [activeTab, setActiveTab] = useState("Home");
  const { isDarkMode, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: "Home", to: "/" },
    { label: "How It Works", to: "/#how-it-works" },
    { label: "Services", to: "/#services" },
    { label: "Pricing", to: "/#pricing" },
    { label: "FAQ", to: "/#faq" },
    { label: "Help", to: "/#help" },
  ];

  return (
    <header className="panda-header">
      <div className="panda-header-container">
        <div className="panda-logo">
          <div className="logo-icon">
            <span className="logo-p">P</span>
            <span className="logo-dot"></span>
          </div>
          <div className="logo-text">
            <span className="text-black">Panda</span>
            <span className="text-blue"> Numbers</span>
          </div>
        </div>

        <nav className={`panda-nav ${mobileMenuOpen ? "mobile-open" : ""}`}>
          {navLinks.map((link) => (
            <Link
              key={link.label}
              to={link.to}
              className={`nav-item ${activeTab === link.label ? "active" : ""}`}
              onClick={() => {
                setActiveTab(link.label);
                setMobileMenuOpen(false);
              }}
            >
              {link.label}
            </Link>
          ))}
          <div className="mobile-actions">
            <Link className="sign-in-btn" to="/login">
              Sign in
            </Link>
            <Link className="get-started-btn" to="/signup">
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
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
        </button>
      </div>
    </header>
  );
};

export default Navbar;
