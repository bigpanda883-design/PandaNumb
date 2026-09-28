import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FiArrowUpRight, FiArrowDownLeft, FiCreditCard } from "react-icons/fi";
import { usePageLoading } from "../hooks/usePageLoading";
import { useTransactions } from "../hooks/useTransactions";
import { TransactionsSkeleton } from "../components/skeleton/PageSkeletons";
import "../CSS/dashboard/pages/Transactions.css";

/** Format a signed naira amount the way both list UIs already render it. */
function formatAmount(amount) {
  const sign = amount >= 0 ? "+" : "-";
  const value = Math.abs(amount).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}₦${value}`;
}

function Transactions() {
  const [activeTab, setActiveTab] = useState("all");
  const navigate = useNavigate();
  const { isLoading } = usePageLoading();
  // Real history from the shared store - empty for a brand-new account.
  const transactions = useTransactions();

  if (isLoading) return <TransactionsSkeleton />;

  const filteredTransactions = transactions.filter((tx) => {
    if (activeTab === "all") return true;
    return tx.type === activeTab;
  });

  const handleRowClick = (path) => {
    if (path) {
      navigate(path);
    }
  };

  return (
    <section className="transactions-page">
      <div className="transactions-header">
        <h1 className="transactions-title">Transactions</h1>
        <p className="transactions-subtitle">
          Deposits, purchases and refunds.
        </p>
      </div>

      {/* Navigation Pills/Tabs */}
      <div className="tx-tabs-container">
        <button
          className={`tx-tab-btn ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          All
        </button>
        <button
          className={`tx-tab-btn ${activeTab === "deposit" ? "active" : ""}`}
          onClick={() => setActiveTab("deposit")}
        >
          Deposits
        </button>
        <button
          className={`tx-tab-btn ${activeTab === "purchase" ? "active" : ""}`}
          onClick={() => setActiveTab("purchase")}
        >
          Purchases
        </button>
        <button
          className={`tx-tab-btn ${activeTab === "refund" ? "active" : ""}`}
          onClick={() => setActiveTab("refund")}
        >
          Refunds
        </button>
      </div>

      {/* Transaction List or Empty State */}
      <div className="tx-content-area">
        {filteredTransactions.length > 0 ? (
          <div className="tx-list">
            {filteredTransactions.map((tx) => (
              <div
                key={tx.id}
                className="tx-card-row"
                role="button"
                tabIndex={0}
                onClick={() => handleRowClick(tx.path)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleRowClick(tx.path);
                  }
                }}
              >
                <div className="tx-left">
                  <div className={`tx-icon-circle ${tx.type}`}>
                    {tx.type === "purchase" ? (
                      <FiArrowUpRight />
                    ) : (
                      <FiArrowDownLeft />
                    )}
                  </div>
                  <div className="tx-details">
                    <span className="tx-title">{tx.title}</span>
                    <span className="tx-date">{tx.date}</span>
                  </div>
                </div>

                <div className="tx-right">
                  <span className={`tx-amount ${tx.type}`}>
                    {formatAmount(tx.amount)}
                  </span>
                  <span className="tx-status-badge">{tx.status}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Empty State for Tabs with no records */
          <div className="tx-empty-state-card">
            <div className="empty-icon-circle">
              <FiCreditCard />
            </div>
            <h2>Nothing here yet</h2>
            <p>
              Once you fund your wallet or buy a number, the full history shows
              up here.
            </p>
            <Link to="/deposit" className="tx-fund-btn">
              Fund wallet
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

export default Transactions;
