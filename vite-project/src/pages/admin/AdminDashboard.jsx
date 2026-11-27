/**
 * Admin Dashboard - Overview.
 *
 * This is the approved Overview design, preserved as-is. It moved here from
 * AdminPayments.jsx so the sidebar/header live once in AdminLayout and the
 * mobile-drawer/theme logic is not duplicated per page. It is reachable at
 * /admin/dashboard and owns exactly one stylesheet: AdminDashboard.css
 * (every selector is scoped to `.admin-dashboard-page`).
 */
import { useCallback, useEffect, useState } from "react";
import {
  FiActivity,
  FiBarChart2,
  FiCreditCard,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiShoppingBag,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import {
  fetchAdminDeposits,
  fetchAdminPaymentSummary,
  fetchAdminStatus,
  fetchAdminVirtualAccounts,
  fetchAdminWebhooks,
} from "../../services/apiClient";
import { formatDate, formatNaira } from "./format";
// Shared admin shell + primitives, then the Overview page's own stylesheet.
import "../../CSS/dashboard/admin/admin.css";
import "../../CSS/dashboard/pages/AdminDashboard.css";

function StatusBadge({ value }) {
  const status = String(value || "Unknown").toUpperCase();
  const tone =
    status === "CREDITED" || status === "SUCCESS" || status === "ACTIVE"
      ? "success"
      : status === "PENDING" || status === "RECEIVED"
        ? "pending"
        : status === "FAILED" || status === "ERROR"
          ? "danger"
          : "neutral";
  return <span className={`admin-status-pill ${tone}`}>{status}</span>;
}

function AdminDashboard() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [totals, setTotals] = useState({
    users: 0,
    accounts: 0,
    deposits: 0,
    webhooks: 0,
  });
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasAccess, setHasAccess] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      await fetchAdminStatus();
      setHasAccess(true);
      const [accountPage, depositPage, webhookPage, paymentSummary] =
        await Promise.all([
          fetchAdminVirtualAccounts({ limit: 25, offset: 0 }),
          fetchAdminDeposits({ limit: 25, offset: 0 }),
          fetchAdminWebhooks({ limit: 25, offset: 0 }),
          fetchAdminPaymentSummary(),
        ]);
      setAccounts(accountPage.items || []);
      setDeposits(depositPage.items || []);
      setWebhooks(webhookPage.items || []);
      setSummary(paymentSummary || null);
      setTotals({
        users: Number(paymentSummary?.wallets?.users || 0),
        accounts: Number(accountPage.total || 0),
        deposits: Number(depositPage.total || 0),
        webhooks: Number(
          paymentSummary?.webhooks?.total || webhookPage.total || 0,
        ),
      });
      setLastUpdated(new Date());
    } catch (loadError) {
      setHasAccess(loadError?.status === 403 ? false : null);
      setError(
        loadError?.status === 403
          ? "Administrator access is not enabled for this account."
          : loadError?.message || "Admin data could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const creditedDeposits = deposits.filter(
    (deposit) => String(deposit.status).toUpperCase() === "CREDITED",
  );
  const creditedTotal = creditedDeposits.reduce(
    (sum, deposit) => sum + Number(deposit.amount || 0),
    0,
  );

  return (
    <div className="admin-dashboard-page">
      {error && (
        <div className="admin-dashboard-alert" role="alert">
          <FiShield aria-hidden="true" />
          <span>{error}</span>
          {hasAccess !== false && (
            <button type="button" onClick={load}>
              <FiRefreshCw aria-hidden="true" /> Retry
            </button>
          )}
        </div>
      )}

      {hasAccess === false ? (
        <section className="admin-access-state">
          <FiShield aria-hidden="true" />
          <h1>Administrator access required</h1>
          <p>
            Sign in with an account approved in the server&apos;s{" "}
            <code>ADMIN_EMAILS</code> setting.
          </p>
          <button type="button" onClick={() => navigate("/login")}>
            Sign in
          </button>
        </section>
      ) : (
        <>
          <section className="admin-hero-banner">
            <div>
              <span>
                <FiTrendingUp aria-hidden="true" /> Admin Dashboard
              </span>
              <h1>Welcome back, Admin!</h1>
              <p>Here&apos;s what&apos;s happening with Panda Number today.</p>
            </div>
            <button type="button" onClick={load} disabled={isLoading}>
              <FiRefreshCw aria-hidden="true" />
              {isLoading ? "Refreshing" : "Refresh"}
            </button>
          </section>

          <section className="admin-kpi-grid" aria-label="Payment overview">
            <article className="admin-kpi-card">
              <span className="admin-kpi-icon blue">
                <FiUsers />
              </span>
              <div>
                <small>Total Users</small>
                <strong>
                  {isLoading ? "—" : totals.users.toLocaleString("en-NG")}
                </strong>
              </div>
              <span className="admin-kpi-live">Live accounts</span>
            </article>
            <article className="admin-kpi-card">
              <span className="admin-kpi-icon green">
                <FiShoppingBag />
              </span>
              <div>
                <small>Total Purchases</small>
                <strong>
                  {isLoading ? "—" : totals.accounts.toLocaleString("en-NG")}
                </strong>
              </div>
              <span className="admin-kpi-live">Recorded</span>
            </article>
            <article className="admin-kpi-card">
              <span className="admin-kpi-icon purple">
                <FiCreditCard />
              </span>
              <div>
                <small>Confirmed Deposits</small>
                <strong>
                  {isLoading
                    ? "—"
                    : formatNaira(
                        summary?.deposits?.creditedTotal ?? creditedTotal,
                      )}
                </strong>
              </div>
              <span className="admin-kpi-live">
                {summary ? `${summary.deposits.credited} credited` : "Credited"}
              </span>
            </article>
            <article className="admin-kpi-card">
              <span className="admin-kpi-icon orange">
                <FiActivity />
              </span>
              <div>
                <small>Webhook Events</small>
                <strong>
                  {isLoading ? "—" : totals.webhooks.toLocaleString("en-NG")}
                </strong>
              </div>
              <span className="admin-kpi-live">Live provider events</span>
            </article>
          </section>

          <section className="admin-overview-grid">
            <article className="admin-data-card admin-sales-card">
              <div className="admin-card-heading">
                <div>
                  <span className="admin-card-title-icon">
                    <FiBarChart2 />
                  </span>
                  <h2>Deposit Overview</h2>
                </div>
                <strong>{formatNaira(creditedTotal)}</strong>
              </div>
              <div className="admin-chart" aria-label="Recent deposit chart">
                <div className="admin-chart-grid">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <svg
                  viewBox="0 0 700 210"
                  role="img"
                  aria-label="Deposit trend"
                >
                  <defs>
                    <linearGradient
                      id="depositArea"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#1682ff" stopOpacity=".22" />
                      <stop
                        offset="100%"
                        stopColor="#1682ff"
                        stopOpacity=".02"
                      />
                    </linearGradient>
                  </defs>
                  <path
                    d="M20 175 C85 160 120 120 185 126 S280 170 345 92 S455 62 520 78 S615 55 680 38 L680 196 L20 196 Z"
                    fill="url(#depositArea)"
                  />
                  <path
                    d="M20 175 C85 160 120 120 185 126 S280 170 345 92 S455 62 520 78 S615 55 680 38"
                    fill="none"
                    stroke="#1682ff"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                  {[20, 185, 345, 520, 680].map((cx, index) => (
                    <circle
                      key={cx}
                      cx={cx}
                      cy={[175, 126, 92, 78, 38][index]}
                      r="7"
                      fill="#1682ff"
                      stroke="#fff"
                      strokeWidth="4"
                    />
                  ))}
                </svg>
              </div>
            </article>

            <article className="admin-data-card admin-activity-card">
              <div className="admin-card-heading">
                <div>
                  <span className="admin-card-title-icon">
                    <FiUsers />
                  </span>
                  <h2>Recent Deposits</h2>
                </div>
                <span className="admin-live-dot">Live</span>
              </div>
              <div className="admin-activity-list">
                {isLoading ? (
                  <p className="admin-empty-copy">Loading deposit records…</p>
                ) : deposits.length === 0 ? (
                  <p className="admin-empty-copy">No deposit activity yet.</p>
                ) : (
                  deposits.slice(0, 5).map((deposit) => (
                    <div className="admin-activity-row" key={deposit.id}>
                      <span className="admin-person-avatar">
                        {(deposit.userName || "C").slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <strong>{deposit.userName || "Customer"}</strong>
                        <small>
                          {deposit.status || "Deposit"} via{" "}
                          {deposit.provider || "Payment"}
                        </small>
                      </div>
                      <span>{formatNaira(deposit.amount)}</span>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="admin-balance-card">
              <span>Total wallet liabilities</span>
              <strong>
                {formatNaira(summary?.wallets?.liabilities ?? creditedTotal)}
              </strong>
              <button type="button" onClick={() => navigate("/admin/payments")}>
                View records
              </button>
              <div className="admin-balance-art">
                <FiCreditCard />
              </div>
            </article>

            <article className="admin-actions-card">
              <h2>Quick Actions</h2>
              <div>
                <button type="button" onClick={() => navigate("/admin/users")}>
                  <FiUsers />
                  <span>Manage Users</span>
                </button>
                <button type="button" onClick={load}>
                  <FiRefreshCw />
                  <span>Refresh Data</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin/transactions")}
                >
                  <FiBarChart2 />
                  <span>View Reports</span>
                </button>
              </div>
            </article>
          </section>

          <section className="admin-dashboard-table admin-data-card">
            <div className="admin-card-heading">
              <div>
                <span className="admin-card-title-icon">
                  <FiActivity />
                </span>
                <h2>Recent Transactions</h2>
              </div>
              <label className="admin-dashboard-search">
                <FiSearch aria-hidden="true" />
                <input
                  aria-label="Search transactions"
                  placeholder="Search records"
                />
              </label>
            </div>
            {isLoading ? (
              <p className="admin-empty-copy">Loading live records…</p>
            ) : deposits.length === 0 ? (
              <p className="admin-empty-copy">
                No deposit transactions have been recorded.
              </p>
            ) : (
              <div className="admin-dashboard-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Reference</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deposits.slice(0, 8).map((deposit) => (
                      <tr key={deposit.id}>
                        <td>
                          <strong>{deposit.userName || "Customer"}</strong>
                          <small>{deposit.userEmail || "No email"}</small>
                        </td>
                        <td>
                          {deposit.txRef ||
                            deposit.transactionId ||
                            "Not reported"}
                        </td>
                        <td>
                          {formatNaira(deposit.amount)}{" "}
                          <small>{deposit.currency || "NGN"}</small>
                        </td>
                        <td>
                          <StatusBadge value={deposit.status} />
                        </td>
                        <td>{formatDate(deposit.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {accounts.length > 0 && (
            <section className="admin-dashboard-table admin-data-card">
              <div className="admin-card-heading">
                <div>
                  <span className="admin-card-title-icon">
                    <FiCreditCard />
                  </span>
                  <h2>Virtual Accounts</h2>
                </div>
                <span className="admin-dashboard-total">
                  {totals.accounts} total
                </span>
              </div>
              <div className="admin-dashboard-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Account</th>
                      <th>Bank</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.slice(0, 6).map((account) => (
                      <tr key={account.id}>
                        <td>
                          <strong>{account.userName || "Customer"}</strong>
                          <small>{account.userEmail}</small>
                        </td>
                        <td>{account.accountNumber || "Not reported"}</td>
                        <td>
                          {account.bankName ||
                            account.provider ||
                            "Not reported"}
                        </td>
                        <td>
                          <StatusBadge value={account.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <footer className="admin-dashboard-footer">
            <span>Panda Number · Admin console</span>
            <span>
              {lastUpdated
                ? `Last updated ${formatDate(lastUpdated)}`
                : "Waiting for live data"}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}

export default AdminDashboard;
