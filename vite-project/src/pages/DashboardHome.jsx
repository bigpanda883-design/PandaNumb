import { useState } from "react";
import {
  FiEye,
  FiEyeOff,
  FiSmartphone,
  FiDollarSign,
  FiCheckCircle,
  FiCreditCard,
  FiPlus,
  FiArrowDownLeft,
  FiArrowUpRight,
} from "react-icons/fi";
import {
  FaWhatsapp,
  FaTelegramPlane,
  FaInstagram,
  FaFacebookF,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { useBalance } from "../hooks/useBalance";
import { useTransactions } from "../hooks/useTransactions";
import { useUsdToNgnRate } from "../wallet/exchangeRate";
import { DashboardHomeSkeleton } from "../components/skeleton/PageSkeletons";
import "../CSS/dashboard/pages/DashboardHome.css";

function DashboardHome() {
  const navigate = useNavigate();

  const [hideBalance, setHideBalance] = useState(true);
  const [currency, setCurrency] = useState("NGN");

  // Balance comes from the shared wallet store (never a literal), and the USD
  // figure is derived from the freshly fetched rate.
  const { animatedBalance, isLoading, error, retry } = useBalance();
  const {
    rate,
    isLoading: rateLoading,
    isFallback: rateIsFallback,
  } = useUsdToNgnRate();
  // Real activity, shared with the Transactions page. Empty for a new account.
  const allTransactions = useTransactions();
  const recentTransactions = allTransactions.slice(0, 3);
  const numbersPurchased = allTransactions.filter(
    (tx) => tx.type === "purchase" && tx.status === "SUCCESSFUL",
  ).length;
  const formatNaira = (value) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
    }).format(value || 0);

  const formatUsd = (value) => {
    if (!rate) return null;
    return `$${(value / rate).toFixed(2)}`;
  };

  // Show the skeleton only while the first fetch is genuinely in flight.
  //
  // This used to also wait for `balance === null`. The fetch sets that to null
  // when the balance endpoint is missing or unreachable (which is exactly what
  // happens on a static host or a phone on flaky mobile data), so the skeleton
  // never went away and the whole dashboard was stuck loading. `useBalance`
  // always settles `isLoading` to false, and a missing balance is rendered as
  // an explicit 0 / "unavailable" below rather than hanging the page.
  if (isLoading) {
    return <DashboardHomeSkeleton />;
  }

  // `animatedBalance` can still be 0 for a frame after loading ends (the
  // count-up animation); the displayed money value below uses it, so guard
  // against a null balance reading as NaN.
  const displayBalance = Number.isFinite(animatedBalance) ? animatedBalance : 0;

  return (
    <div className="dashboard-home-wrapper">
      <div className="dashboard-home-container">
        {/* BLUE BALANCE CARD */}
        <div className="balance-card-banner">
          <div className="balance-top-row">
            <button
              type="button"
              className="toggle-balance-btn"
              onClick={() => setHideBalance(!hideBalance)}
            >
              <span>Available Balance</span>
              {hideBalance ? <FiEyeOff /> : <FiEye />}
            </button>

            <div className="currency-toggle-pill">
              <button
                type="button"
                className={currency === "NGN" ? "active" : ""}
                onClick={() => setCurrency("NGN")}
              >
                ₦ NGN
              </button>
              <button
                type="button"
                className={currency === "USD" ? "active" : ""}
                onClick={() => setCurrency("USD")}
              >
                $ USD
              </button>
            </div>
          </div>

          {/* BALANCE DISPLAY */}
          <div className="balance-amount-display">
            {error ? (
              /* API failure - say so rather than showing a fake figure. */
              <div className="balance-error-text">
                <span>Balance unavailable right now.</span>
                <button
                  type="button"
                  className="balance-retry-btn"
                  onClick={retry}
                >
                  Retry
                </button>
              </div>
            ) : hideBalance ? (
              <div className="masked-dots">
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </div>
            ) : (
              <span className="balance-text">
                {currency === "NGN"
                  ? formatNaira(displayBalance)
                  : rateLoading
                    ? "Loading rate…"
                    : (formatUsd(displayBalance) ?? "Rate unavailable")}
              </span>
            )}
          </div>

          {/* ACTION BUTTONS */}
          <div className="balance-actions-row">
            {rateIsFallback && currency === "USD" && !rateLoading && (
              <span className="rate-fallback-note">
                Offline rate · live rate unavailable
              </span>
            )}
            <button
              type="button"
              className="deposit-action-btn"
              onClick={() => navigate("/deposit")}
            >
              <FiPlus />
              <span>Deposit</span>
            </button>
            <button
              type="button"
              className="buy-number-action-btn"
              onClick={() => navigate("/buy")}
            >
              <FiSmartphone />
              <span>Buy Number</span>
            </button>
          </div>
        </div>

        {/* STATS GRID */}
        <section className="stats-cards-grid">
          <div className="stat-card">
            <div className="stat-icon-circle blue">
              <FiSmartphone />
            </div>
            <div className="stat-value">{numbersPurchased}</div>
            <div className="stat-label">Numbers purchased</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-circle light-blue">
              <FiDollarSign />
            </div>
            <div className="stat-value">0</div>
            <div className="stat-label">Active numbers</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-circle check-blue">
              <FiCheckCircle />
            </div>
            <div className="stat-value">
              {
                allTransactions.filter((tx) => tx.status === "SUCCESSFUL")
                  .length
              }
            </div>
            <div className="stat-label">Completed activities</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-circle wallet-blue">
              <FiCreditCard />
            </div>
            <div className="stat-value">{formatNaira(displayBalance)}</div>
            <div className="stat-label">Wallet balance</div>
          </div>
        </section>

        {/* POPULAR SERVICES */}
        <section className="popular-services-section">
          <div className="section-header-row">
            <h2 className="section-title">Popular services</h2>
            <button
              type="button"
              className="buy-link-btn"
              onClick={() => navigate("/buy")}
            >
              Buy a number
            </button>
          </div>

          <div className="popular-services-grid">
            <ServiceCard
              name="WhatsApp"
              subtext="Get a number"
              brandClass="whatsapp"
              Icon={FaWhatsapp}
              onClick={() =>
                navigate("/buy", { state: { service: "WhatsApp" } })
              }
            />
            <ServiceCard
              name="Telegram"
              subtext="Get a number"
              brandClass="telegram"
              Icon={FaTelegramPlane}
              onClick={() =>
                navigate("/buy", { state: { service: "Telegram" } })
              }
            />
            <ServiceCard
              name="Instagram"
              subtext="Get a number"
              brandClass="instagram"
              Icon={FaInstagram}
              onClick={() =>
                navigate("/buy", { state: { service: "Instagram" } })
              }
            />
            <ServiceCard
              name="Facebook"
              subtext="Get a number"
              brandClass="facebook"
              Icon={FaFacebookF}
              onClick={() =>
                navigate("/buy", { state: { service: "Facebook" } })
              }
            />
          </div>
        </section>

        {/* RECENT TRANSACTIONS */}
        <section className="recent-transactions-section">
          <div className="section-header-row">
            <h2 className="section-title">Recent Transactions</h2>
            <button
              type="button"
              className="buy-link-btn"
              onClick={() => navigate("/transactions")}
            >
              View all
            </button>
          </div>

          <div className="transaction-list">
            {recentTransactions.length > 0 ? (
              recentTransactions.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  title={tx.title}
                  date={tx.date}
                  amount={tx.amount}
                  status={tx.status}
                />
              ))
            ) : (
              /* A brand-new account genuinely has no activity yet. */
              <div className="empty-state">
                <strong>No transactions yet</strong>
                <span>
                  Fund your wallet or buy a number and your activity shows up
                  here.
                </span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ServiceCard({ name, subtext, brandClass, Icon, onClick }) {
  return (
    <div
      className="service-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className={`service-icon-wrapper ${brandClass}`}>
        <Icon />
      </div>
      <div className="service-card-info">
        <h3 className="service-name">{name}</h3>
        <span className="service-subtext">{subtext}</span>
      </div>
    </div>
  );
}

function TransactionRow({ title, date, amount, status }) {
  const isDeposit = amount >= 0;
  const displayAmount = `${isDeposit ? "+" : "-"}₦${Math.abs(
    amount,
  ).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  return (
    <article className="transaction-row">
      <span
        className={`transaction-icon ${isDeposit ? "deposit" : "purchase"}`}
      >
        {isDeposit ? <FiArrowDownLeft /> : <FiArrowUpRight />}
      </span>
      <div className="transaction-copy">
        <strong>{title}</strong>
        <span>{date}</span>
      </div>
      <div className="transaction-amount">
        <strong className={isDeposit ? "positive" : "negative"}>
          {displayAmount}
        </strong>
        <span className="status-badge">{status}</span>
      </div>
    </article>
  );
}

export default DashboardHome;
