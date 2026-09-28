import { useEffect, useState } from "react";
import { FiMessageSquare, FiX } from "react-icons/fi";
import "../CSS/WhatsAppPopup.css";

/**
 * WhatsApp announcement popup.
 *
 * Shown once per browser session, after the user lands on the dashboard from a
 * login or signup. The "once" guarantee uses sessionStorage, so it does not
 * reappear on every re-render or navigation, but a fresh session (or a fresh
 * sign-in) shows it again.
 *
 * The link is the same WhatsApp contact already used by the Footer and Help
 * Center - no new number is introduced here.
 */
const WHATSAPP_LINK = "https://wa.me/2349048247067?text=Hi%20Panda%20Numbers";
const SEEN_KEY = "panda-whatsapp-announcement-seen";

function WhatsAppAnnouncementPopup() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Only announce inside an authenticated session.
    const hasAuth = Boolean(localStorage.getItem("panda-numbers-auth"));
    // `alreadySeen` is only ever read once below; a failed storage read is
    // treated as "not seen", so the default and the catch agree.
    let alreadySeen;
    try {
      alreadySeen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      alreadySeen = false;
    }

    if (!hasAuth || alreadySeen) return;

    // Small delay so it appears after the dashboard has settled, not on top of
    // the page-entrance transition.
    const timer = window.setTimeout(() => setIsOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  const handleClose = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Session storage unavailable - the popup simply may show again later.
    }
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="whatsapp-popup-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsapp-popup-title"
      onClick={handleClose}
    >
      <div
        className="whatsapp-popup"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="whatsapp-popup-close"
          aria-label="Close announcement"
          onClick={handleClose}
        >
          <FiX />
        </button>

        <div className="whatsapp-popup-icon">
          <FiMessageSquare aria-hidden="true" />
        </div>

        <h2 id="whatsapp-popup-title" className="whatsapp-popup-title">
          Need help getting started?
        </h2>
        <p className="whatsapp-popup-text">
          Chat with Panda Numbers support on WhatsApp for wallet top-ups, number
          purchases and verification codes.
        </p>

        <a
          className="whatsapp-popup-btn"
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClose}
        >
          <FiMessageSquare aria-hidden="true" />
          Chat on WhatsApp
        </a>

        <button
          type="button"
          className="whatsapp-popup-dismiss"
          onClick={handleClose}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

export default WhatsAppAnnouncementPopup;
