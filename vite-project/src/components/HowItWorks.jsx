import { useState } from "react";
import { FiCheckCircle } from "react-icons/fi";
import { Link } from "react-router-dom";
import "../CSS/HowItWorks.css";

const HowItWorks = () => {
  const [hoveredIndex, setHoveredIndex] = useState(1);

  const cardsData = [
    {
      id: 0,
      title: "Wallet funding",
      price: "₦100",
      priceSub: "minimum deposit",
      badge: null,
      features: [
        "Presets of ₦100, ₦500, ₦1,000, ₦5,000 and ₦10,000",
        "Custom amounts supported",
        "Wallet credits only after payment is confirmed",
      ],
      buttonText: "Fund Wallet",
    },
    {
      id: 1,
      title: "Virtual numbers",
      price: "₦2,000+",
      priceSub: "current range ₦2,000 – ₦3,500",
      badge: "MOST BOUGHT",
      features: [
        "Price depends on service, country and availability",
        "Exact price shown on the review screen",
        "Admin-configured — never a flat fake rate",
      ],
      buttonText: "Buy a Number",
    },
    {
      id: 2,
      title: "What affects a price",
      price: null,
      priceSub: null,
      badge: null,
      detailsList: [
        {
          label: "Service",
          desc: "Some platforms cost more to verify than others.",
        },
        {
          label: "Country",
          desc: "Local Nigerian numbers are cheaper than international ones.",
        },
        {
          label: "Availability",
          desc: "Scarce stock moves the price for that combination.",
        },
        {
          label: "Admin pricing",
          desc: "Every service and country pair is priced individually.",
        },
      ],
      buttonText: "Explore Pricing",
    },
  ];

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
        {cardsData.map((card, idx) => {
          const isSelected = hoveredIndex === idx;

          return (
            <div
              key={card.id}
              className={`pricing-card ${isSelected ? "active-card" : ""}`}
              onMouseEnter={() => setHoveredIndex(idx)}
            >
              <div className="card-top-header">
                <span className="card-title">{card.title}</span>
                {card.badge && (
                  <span className="most-bought-badge">{card.badge}</span>
                )}
              </div>

              {card.price && (
                <div className="card-price-wrapper">
                  <div className="card-price">{card.price}</div>
                  <div className="card-price-sub">{card.priceSub}</div>
                </div>
              )}

              {card.features && (
                <div className="card-features-list">
                  {card.features.map((feature, fIdx) => (
                    <div key={fIdx} className="feature-item">
                      <FiCheckCircle className="check-icon" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              )}

              {card.detailsList && (
                <div className="card-details-list">
                  {card.detailsList.map((item, dIdx) => (
                    <div key={dIdx} className="detail-item">
                      <span className="detail-label">{item.label}</span>
                      <p className="detail-desc">{item.desc}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="card-action-container">
                <Link
                  to="/signup"
                  className={`card-btn ${isSelected ? "active-btn" : ""}`}
                >
                  {card.buttonText}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default HowItWorks;
