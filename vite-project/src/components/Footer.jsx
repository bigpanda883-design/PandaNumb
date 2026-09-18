import { Link } from "react-router-dom";
import "../CSS/Footer.css";

const Footer = () => {
  return (
    <footer className="footer-section">
      <div className="footer-container">
        <div className="footer-top">
          {/* BRAND COLUMN */}
          <div className="footer-brand-col">
            <div className="footer-logo">
              <div className="logo-icon">P.</div>
              <span className="logo-text">Panda Numbers</span>
            </div>
            <p className="brand-description">
              Panda Numbers is a virtual number marketplace. Fund your wallet,
              buy a number for the service you need, and receive your
              verification code in one place.
            </p>
          </div>

          {/* PRODUCT LINKS COLUMN */}
          <div className="footer-links-col">
            <h4 className="footer-heading">Product</h4>
            <ul className="footer-links">
              <li>
                <Link to="/#how-it-works">How It Works</Link>
              </li>
              <li>
                <Link to="/#services">Services</Link>
              </li>
              <li>
                <Link to="/#pricing">Pricing</Link>
              </li>
              <li>
                <Link to="/#faq">FAQ</Link>
              </li>
              <li>
                <Link to="/#help">Help</Link>
              </li>
            </ul>
          </div>

          {/* SUPPORT COLUMN */}
          <div className="footer-links-col">
            <h4 className="footer-heading">Support</h4>
            <ul className="footer-links">
              <li>
                <a
                  href="https://wa.me/2349048247067"
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp 09048247067
                </a>
              </li>
              <li>
                <a href="mailto:Bigpanda883@gmail.com">Bigpanda883@gmail.com</a>
              </li>
            </ul>
          </div>
        </div>

        {/* BOTTOM COPYRIGHT ROW */}
        <div className="footer-bottom">
          <p className="copyright-text">
            © 2026 Panda Numbers. All rights reserved.
          </p>
          <p className="currency-text">
            Wallet balances are held in Nigerian Naira.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
