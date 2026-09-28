import { Link, useLocation, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiHome, FiSearch, FiLifeBuoy } from "react-icons/fi";
import { useTheme } from "../context/themeStore";
import "../CSS/NotFound.css";

/**
 * 404 page.
 *
 * Reached by any URL that matches no route. Uses the same brand mark, palette
 * and button shapes as the rest of the app (and the public theme context), so
 * it reads as part of Panda Numbers rather than a dead end.
 */
function NotFound() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDarkMode } = useTheme();

  return (
    <main className="notfound-page">
      <div className="notfound-card">
        <div className="notfound-logo" aria-label="Panda Numbers">
          <div className="logo-icon">
            <span className="logo-p">P</span>
            <span className="logo-dot"></span>
          </div>
          <div className="logo-text">
            <span className="text-black">Panda</span>
            <span className="text-blue"> Numbers</span>
          </div>
        </div>

        <div className="notfound-code" aria-hidden="true">
          404
        </div>

        <h1 className="notfound-title">This page took a wrong turn</h1>
        <p className="notfound-text">
          We could not find{" "}
          <code className="notfound-path">{location.pathname}</code>. The link
          may be old, or the page may have moved.
        </p>

        <div className="notfound-actions">
          <Link className="notfound-btn primary" to="/dashboard">
            <FiHome aria-hidden="true" />
            Back to dashboard
          </Link>
          <button
            type="button"
            className="notfound-btn secondary"
            onClick={() => navigate(-1)}
          >
            <FiArrowLeft aria-hidden="true" />
            Go back
          </button>
        </div>

        <div className="notfound-suggestions">
          <span className="notfound-suggestions-label">Popular pages</span>
          <div className="notfound-links">
            <Link className="notfound-link" to="/buy">
              <FiSearch aria-hidden="true" />
              Buy a number
            </Link>
            <Link className="notfound-link" to="/my-numbers">
              My numbers
            </Link>
            <Link className="notfound-link" to="/transactions">
              Transactions
            </Link>
            <Link className="notfound-link" to="/help-center">
              <FiLifeBuoy aria-hidden="true" />
              Help Center
            </Link>
          </div>
        </div>

        <p className="notfound-footer">
          {isDarkMode ? "Dark" : "Light"} theme · Panda Numbers
        </p>
      </div>
    </main>
  );
}

export default NotFound;
