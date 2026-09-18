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
import { getAuthUser } from "../auth/authStorage";
import "../CSS/dashboard/pages/DashboardHome.css";

function DashboardHome() {
  const navigate = useNavigate();
  const user = getAuthUser();
  const firstName = user?.fullName?.split(" ")[0] || "Big";
  const email = user?.email || "fxpanda74@gmail.com";
  const phone = user?.phone || "09132490567";

  const [hideBalance, setHideBalance] = useState(true);
  const [currency, setCurrency] = useState("NGN");

  return (
    <div className="dashboard-home-wrapper">
      <div className="dashboard-home-container">
        {/* GREETING SECTION */}
        <section className="dashboard-greeting">
          <span className="greeting-sub">Good morning,</span>
          <h1 className="greeting-name">
            {firstName} <span className="wave-hand">👋</span>
          </h1>
          <p className="greeting-meta">
            {email} · {phone}
          </p>
        </section>

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
            {hideBalance ? (
              <div className="masked-dots">
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </div>
            ) : (
              <span className="balance-text">
                {currency === "NGN" ? "₦10,750.00" : "$14.20"}
              </span>
            )}
          </div>

          {/* ACTION BUTTONS */}
          <div className="balance-actions-row">
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
            <div className="stat-value">2</div>
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
            <div className="stat-value">2</div>
            <div className="stat-label">Verifications completed</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-circle wallet-blue">
              <FiCreditCard />
            </div>
            <div className="stat-value">₦7,550.00</div>
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
            <TransactionRow
              type="deposit"
              title="TEST deposit · demo bank transfer"
              date="17 Sept 2026, 23:19"
              amount="+₦100.00"
            />
            <TransactionRow
              type="deposit"
              title="TEST deposit · demo bank transfer"
              date="17 Sept 2026, 23:16"
              amount="+₦1,000.00"
            />
            <TransactionRow
              type="purchase"
              title="Telegram number +1 229 838 3490"
              date="07 Sept 2026, 07:52"
              amount="-₦2,800.00"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function ServiceCard({ name, subtext, brandClass, Icon, onClick }) {
  return (
    <div className="service-card" onClick={onClick} role="button" tabIndex={0}>
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

function TransactionRow({ type, title, date, amount }) {
  const isDeposit = type === "deposit";
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
          {amount}
        </strong>
        <span className="status-badge">SUCCESSFUL</span>
      </div>
    </article>
  );
}

export default DashboardHome;
