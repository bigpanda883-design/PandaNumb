import { useState } from "react";
import { Link } from "react-router-dom";
import "../CSS/CTA.css";

const CTA = () => {
  const [activeTab, setActiveTab] = useState("dashboard");

  const tabData = {
    dashboard: {
      title: "Everything at a glance",
      description:
        "Greeting, wallet balance, quick actions and your most recent wallet activity on one screen.",
      url: "pandanumbers.app/dashboard",
      desktopContent: (
        <div className="preview-card-body">
          <div className="balance-banner">
            <span className="balance-label">Available Balance</span>
            <h3 className="balance-amount">₦25,400.00</h3>
          </div>
          <div className="action-row">
            <Link className="btn-primary" to="/signup">
              Deposit
            </Link>
            <Link className="btn-outline" to="/signup">
              Buy Number
            </Link>
          </div>
          <div className="history-list">
            <div className="history-item">Deposit +₦10,000</div>
            <div className="history-item">Number purchase -₦2,000</div>
            <div className="history-item">Number purchase -₦2,500</div>
          </div>
        </div>
      ),
      mobileContent: (
        <div className="mobile-card-body">
          <div className="balance-banner small">
            <span className="balance-label">Available Balance</span>
            <h4 className="balance-amount">₦25,400.00</h4>
          </div>
          <div className="action-row compact">
            <Link className="btn-primary sm" to="/signup">
              Deposit
            </Link>
            <Link className="btn-outline sm" to="/signup">
              Buy Number
            </Link>
          </div>
          <div className="history-list compact">
            <div className="history-item sm">Deposit +₦10,000</div>
            <div className="history-item sm">Number purchase -₦2,...</div>
            <div className="history-item sm">Number purchase -₦2,...</div>
          </div>
        </div>
      ),
    },
    wallet: {
      title: "Fund in seconds",
      description:
        "Preset amounts from ₦100, a custom field, and a clear payment state at every step.",
      url: "pandanumbers.app/wallet",
      desktopContent: (
        <div className="preview-card-body">
          <h4 className="card-heading">Deposit to wallet</h4>
          <div className="amount-flex-grid">
            <div className="amount-chip">₦100</div>
            <div className="amount-chip">₦500</div>
            <div className="amount-chip">₦1,000</div>
            <div className="amount-chip active">₦5,000</div>
            <div className="amount-chip">₦10,000</div>
            <div className="amount-chip">Custom</div>
          </div>
          <Link className="btn-primary full-width" to="/signup">
            Continue to Payment
          </Link>
        </div>
      ),
      mobileContent: (
        <div className="mobile-card-body">
          <h5 className="card-heading">Deposit to wallet</h5>
          <div className="amount-flex-grid compact">
            <div className="amount-chip sm">₦100</div>
            <div className="amount-chip sm">₦500</div>
            <div className="amount-chip sm">₦1,000</div>
            <div className="amount-chip sm active">₦5,000</div>
            <div className="amount-chip sm">₦10,000</div>
            <div className="amount-chip sm">Custom</div>
          </div>
          <Link className="btn-primary full-width sm" to="/signup">
            Continue to Payment
          </Link>
        </div>
      ),
    },
    buy: {
      title: "Four calm steps",
      description:
        "Service, country, number, review. The price and your balance after purchase are always visible.",
      url: "pandanumbers.app/buy",
      desktopContent: (
        <div className="preview-card-body">
          <div className="step-bars">
            <span className="step-bar active"></span>
            <span className="step-bar active"></span>
            <span className="step-bar"></span>
            <span className="step-bar"></span>
          </div>
          <h4 className="card-heading">Choose country</h4>
          <div className="country-list">
            <div className="country-item active">
              <span>
                <strong>NG</strong> Nigeria
              </span>
              <span className="price">₦2,000</span>
            </div>
            <div className="country-item">
              <span>
                <strong>GH</strong> Ghana
              </span>
              <span className="price">₦3,200</span>
            </div>
            <div className="country-item">
              <span>
                <strong>US</strong> United States
              </span>
              <span className="price">₦3,200</span>
            </div>
          </div>
        </div>
      ),
      mobileContent: (
        <div className="mobile-card-body">
          <div className="step-bars compact">
            <span className="step-bar active"></span>
            <span className="step-bar active"></span>
            <span className="step-bar"></span>
            <span className="step-bar"></span>
          </div>
          <h5 className="card-heading">Choose country</h5>
          <div className="country-list compact">
            <div className="country-item sm active">
              <span>
                <strong>NG</strong> Nigeria
              </span>
              <span className="price">₦2,000</span>
            </div>
            <div className="country-item sm">
              <span>
                <strong>GH</strong> Ghana
              </span>
              <span className="price">₦3,200</span>
            </div>
            <div className="country-item sm">
              <span>
                <strong>US</strong> United Stat...
              </span>
              <span className="price">₦3,200</span>
            </div>
          </div>
        </div>
      ),
    },
    numbers: {
      title: "Your numbers, kept",
      description:
        "Order ID, purchase date, price and status for every number, with copy and OTP built in.",
      url: "pandanumbers.app/numbers",
      desktopContent: (
        <div className="preview-card-body">
          <h4 className="card-heading">My Numbers</h4>
          <div className="numbers-list">
            <div className="number-card">
              <div>
                <strong>NG +234 802 441 0072</strong>
                <p className="sub-text">WhatsApp · order PN-240815</p>
              </div>
              <span className="badge-active">active</span>
            </div>
            <div className="number-card">
              <div>
                <strong>GH +233 55 902 1188</strong>
                <p className="sub-text">Telegram · order PN-240815</p>
              </div>
              <span className="badge-active">active</span>
            </div>
          </div>
        </div>
      ),
      mobileContent: (
        <div className="mobile-card-body">
          <h5 className="card-heading">My Numbers</h5>
          <div className="numbers-list compact">
            <div className="number-card sm">
              <div>
                <strong className="truncate">NG +234 802 ...</strong>
                <p className="sub-text sm">WhatsApp · order PN-240815</p>
              </div>
              <span className="badge-active sm">active</span>
            </div>
            <div className="number-card sm">
              <div>
                <strong className="truncate">GH +233 55 9...</strong>
                <p className="sub-text sm">Telegram · order PN-240815</p>
              </div>
              <span className="badge-active sm">active</span>
            </div>
          </div>
        </div>
      ),
    },
  };

  const currentTab = tabData[activeTab];

  return (
    <section className="preview-section">
      <div className="preview-header">
        <span className="pill-badge">PRODUCT PREVIEW</span>
        <h2 className="preview-title">See the app before you sign up</h2>
        <p className="preview-subtitle">
          The same interface on desktop and on your phone.
        </p>

        {/* TAB BUTTONS */}
        <div className="tab-navigation">
          <button
            className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`tab-btn ${activeTab === "wallet" ? "active" : ""}`}
            onClick={() => setActiveTab("wallet")}
          >
            Wallet
          </button>
          <button
            className={`tab-btn ${activeTab === "buy" ? "active" : ""}`}
            onClick={() => setActiveTab("buy")}
          >
            Buy Number
          </button>
          <button
            className={`tab-btn ${activeTab === "numbers" ? "active" : ""}`}
            onClick={() => setActiveTab("numbers")}
          >
            My Numbers
          </button>
        </div>
      </div>

      {/* VIEWPORT CONTENT */}
      <div className="preview-content-layout">
        {/* DESKTOP SCREEN MOCKUP */}
        <div className="desktop-frame">
          <div className="browser-header">
            <div className="browser-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="browser-url-bar">{currentTab.url}</div>
          </div>
          <div className="browser-body">{currentTab.desktopContent}</div>
        </div>

        {/* SIDE DESCRIPTION & MOBILE SCREEN */}
        <div className="side-description-wrap">
          <div className="text-info">
            <h3 className="info-title">{currentTab.title}</h3>
            <p className="info-desc">{currentTab.description}</p>
          </div>

          {/* MOBILE PHONE FRAME */}
          <div className="phone-frame">
            <div className="phone-screen">{currentTab.mobileContent}</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
