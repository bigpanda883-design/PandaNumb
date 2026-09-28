import { useEffect, useState } from "react";
import { FiEye, FiEyeOff, FiPlus, FiSmartphone } from "react-icons/fi";
import { Link } from "react-router-dom";
import { useUsdToNgnRate } from "../wallet/exchangeRate";
import { useBalance } from "../hooks/useBalance";
import "../CSS/dashboard/components/BalanceCard.css";

// NOTE: no provider API key here, and none anywhere in the frontend.
// The SMS provider is reached only through our own backend (server/index.js).

function BalanceCard() {
  const [isVisible, setIsVisible] = useState(true);
  const [currency, setCurrency] = useState("NGN");
  const [animatedValue, setAnimatedValue] = useState(0);

  const {
    rate,
    isLoading: rateLoading,
    isFallback: rateIsFallback,
  } = useUsdToNgnRate();

  // The USER'S balance, from the shared wallet store.
  //
  // This deliberately does NOT call the SMS provider's getBalance: that figure
  // is the provider's own wallet, and showing it as the user's balance would be
  // wrong. The provider balance is surfaced separately via getProviderBalance().
  const {
    balance,
    isLoading: isLoadingBalance,
    error: balanceError,
  } = useBalance();

  const nairaBalance = typeof balance === "number" ? balance : 0;

  // Target balance conversion
  const targetBalance =
    currency === "USD" && rate ? nairaBalance / rate : nairaBalance;

  // Count-up animation
  useEffect(() => {
    let animationFrameId;
    const duration = 1200;
    const startTime = performance.now();

    const animateCount = (currentTime) => {
      const elapsedTime = currentTime - startTime;
      const progress = Math.min(elapsedTime / duration, 1);
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
    if (isLoadingBalance) return "Loading balance…";
    if (balanceError) return "Balance unavailable";

    if (currency === "USD") {
      if (rateLoading) return "Loading rate…";
      if (!rate) return "Rate unavailable";
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
      {/* TOP ROW */}
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

        {/* Currency Switcher */}
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

      {/* MIDDLE ROW */}
      <div className="balance-amount">{formatDisplay()}</div>
      {rateIsFallback && currency === "USD" && !rateLoading && (
        <span className="balance-rate-note">
          Offline rate · live rate unavailable
        </span>
      )}

      {/* BOTTOM ROW */}
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
