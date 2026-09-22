import { FiCheckCircle } from "react-icons/fi";
import { Link } from "react-router-dom";
import "../CSS/HowItWorks.css";

const HowItWorks = () => {
  return (
    <section id="pricing" className="pricing-section">
      <div className="pricing-header">
        <span className="pricing-pill">PRICING</span>
        <h2 className="pricing-title">
          Deposit from ₦100 . Pay only for what you buy.
        </h2>
        <p className="pricing-subtitle">
          Panda Numbers has no subscription. You fund a wallet, and each number
          is charged at its own price.
        </p>
      </div>

      <div className="pricing-cards-container">
        {/* LEFT CARD: Wallet Funding */}
        <div className="pricing-card">
          <div className="card-top-header">
            <span className="card-title">Wallet funding</span>
          </div>

          <div className="card-price-wrapper">
            <div className="card-price">₦100</div>
            <div className="card-price-sub">minimum deposit</div>
          </div>

          <div className="card-features-list">
            <div className="feature-item">
              <FiCheckCircle className="check-icon" />
              <span>Presets of ₦100, ₦500, ₦1,000, ₦5,000 and ₦10,000</span>
            </div>
            <div className="feature-item">
              <FiCheckCircle className="check-icon" />
              <span>Custom amounts supported</span>
            </div>
            <div className="feature-item">
              <FiCheckCircle className="check-icon" />
              <span>Wallet credits only after payment is confirmed</span>
            </div>
          </div>
        </div>

        {/* MIDDLE CARD: Virtual Numbers (ONLY CARD WITH BUTTON) */}
        <div className="pricing-card active-card">
          <div className="card-top-header">
            <span className="card-title">Virtual numbers</span>
            <span className="most-bought-badge">MOST BOUGHT</span>
          </div>

          <div className="card-price-wrapper">
            <div className="card-price">
              ₦2,000<span className="price-plus">+</span>
            </div>
            <div className="card-price-sub">current range ₦2,000 – ₦3,500</div>
          </div>

          <div className="card-features-list">
            <div className="feature-item">
              <FiCheckCircle className="check-icon" />
              <span>Price depends on service, country and availability</span>
            </div>
            <div className="feature-item">
              <FiCheckCircle className="check-icon" />
              <span>Exact price shown on the review screen</span>
            </div>
            <div className="feature-item">
              <FiCheckCircle className="check-icon" />
              <span>Admin-configured — never a flat fake rate</span>
            </div>
          </div>

          <div className="card-action-container">
            <Link to="/signup" className="card-btn">
              Buy a Number
            </Link>
          </div>
        </div>

        {/* RIGHT CARD: What affects a price */}
        <div className="pricing-card">
          <div className="card-top-header">
            <span className="card-title">What affects a price</span>
          </div>

          <div className="card-details-list">
            <div className="detail-item">
              <span className="detail-label">Service</span>
              <p className="detail-desc">
                Some platforms cost more to verify than others.
              </p>
            </div>
            <div className="detail-item">
              <span className="detail-label">Country</span>
              <p className="detail-desc">
                Local Nigerian numbers are cheaper than international ones.
              </p>
            </div>
            <div className="detail-item">
              <span className="detail-label">Availability</span>
              <p className="detail-desc">
                Scarce stock moves the price for that combination.
              </p>
            </div>
            <div className="detail-item">
              <span className="detail-label">Admin pricing</span>
              <p className="detail-desc">
                Every service and country pair is priced individually.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;