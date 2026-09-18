import { useEffect, useState } from "react";
import { FiEye, FiEyeOff, FiPlus, FiSmartphone } from "react-icons/fi";
import { Link } from "react-router-dom";
import "../CSS/dashboard/components/BalanceCard.css";

function BalanceCard({ baseNairaBalance = 10750 }) {
  const [isVisible, setIsVisible] = useState(true);
  const [currency, setCurrency] = useState("NGN"); // "NGN" or "USD"
  const [animatedValue, setAnimatedValue] = useState(0);

  // Conversion rate: $1 USD = 1500 NGN (adjust if needed)
  const EXCHANGE_RATE_USD = 1500;

  // Target balance depending on selected currency
  const targetBalance =
    currency === "USD"
      ? baseNairaBalance / EXCHANGE_RATE_USD
      : baseNairaBalance;

  // Count-up animation on refresh or currency change
  useEffect(() => {
    let animationFrameId;
    const duration = 1200; // 1.2 seconds count animation
    const startTime = performance.now();

    const animateCount = (currentTime) => {
      const elapsedTime = currentTime - startTime;
      const progress = Math.min(elapsedTime / duration, 1);

      // Ease-out curve
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setAnimatedValue(easeOut * targetBalance);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animateCount);
      }
    };

    animationFrameId = requestAnimationFrame(animateCount);

    return () => cancelAnimationFrame(animationFrameId);
  }, [targetBalance]);

  // Format currency display string
  const formatDisplay = () => {
    if (!isVisible) return "••••••";

    if (currency === "USD") {
      return `$${animatedValue.toFixed(2)}`;
    }

    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
    }).format(animatedValue);
  };

  return (
    <section className="balance-card" aria-label="Wallet balance">
      {/* TOP ROW: Header + Eye Icon on Left | Currency Switcher on Right */}
      <div className="balance-card-header">
        <div className="balance-label-wrapper">
          <span className="balance-label">Available Balance</span>
          <button
            type="button"
            className="balance-eye-btn"
            onClick={() => setIsVisible((prev) => !prev)}
            aria-label={isVisible ? "Hide balance" : "Show balance"}
          >
            {isVisible ? <FiEye /> : <FiEyeOff />}
          </button>
        </div>

        {/* Currency Switcher Top Right */}
        <div className="currency-switcher" aria-label="Currency option">
          <button
            type="button"
            className={`currency-pill ${currency === "NGN" ? "active" : ""}`}
            onClick={() => setCurrency("NGN")}
          >
            ₦ NGN
          </button>
          <button
            type="button"
            className={`currency-pill ${currency === "USD" ? "active" : ""}`}
            onClick={() => setCurrency("USD")}
          >
            $ USD
          </button>
        </div>
      </div>

      {/* MIDDLE ROW: Big Animated Balance */}
      <div className="balance-amount">{formatDisplay()}</div>

      {/* BOTTOM ROW: Action Buttons */}
      <div className="balance-actions">
        <Link className="balance-btn secondary-btn" to="/deposit">
          <FiPlus className="btn-icon" />
          <span>Deposit</span>
        </Link>
        <Link className="balance-btn primary-btn" to="/buy">
          <FiSmartphone className="btn-icon" />
          <span>Buy Number</span>
        </Link>
      </div>
    </section>
  );
}

export default BalanceCard;
