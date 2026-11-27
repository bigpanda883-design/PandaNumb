/**
 * Transactions - /admin/transactions
 *
 * Data comes from fetchAdminTransactions (unchanged endpoint). Styling:
 * admin/admin.css (shared) + admin/AdminTransactions.css (page scoped).
 */
import { FiActivity, FiRefreshCw } from "react-icons/fi";
import { fetchAdminTransactions } from "../../services/apiClient";
import useAsyncResource from "../../hooks/useAsyncResource";
import { formatDate, formatNaira, formatNumber } from "./format";
import { EmptyState, ErrorState, LoadingState, StatCard } from "./adminUi";
import "../../CSS/dashboard/admin/admin.css";
import "../../CSS/dashboard/admin/AdminTransactions.css";

const CREDIT_TYPES = ["deposit", "refund", "credit", "bonus"];
const DEBIT_TYPES = ["purchase", "debit", "withdrawal", "charge"];

function directionOf(item) {
  const type = String(item.type || "").toLowerCase();
  if (CREDIT_TYPES.includes(type)) return "credit";
  if (DEBIT_TYPES.includes(type)) return "debit";
  return "";
}

function TransactionsPage() {
  const { loading, error, data, refresh } = useAsyncResource(() =>
    fetchAdminTransactions({ limit: 50, offset: 0 }),
  );

  const items = data?.items || [];
  const total = data?.total ?? items.length;
  const credited = items
    .filter((item) => directionOf(item) === "credit")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const debited = items
    .filter((item) => directionOf(item) === "debit")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return (
    <div className="admin-page-body admin-transactions-page">
      <div className="admin-stat-grid">
        <StatCard icon={FiActivity} label="Transactions" value={total} />
        <StatCard
          icon={FiActivity}
          label="Credits (latest 50)"
          value={formatNaira(credited)}
          tone="green"
        />
        <StatCard
          icon={FiActivity}
          label="Debits (latest 50)"
          value={formatNaira(debited)}
          tone="red"
        />
        <StatCard
          icon={FiActivity}
          label="Showing"
          value={formatNumber(items.length)}
          hint="Most recent wallet movements"
          tone="purple"
        />
      </div>

      <section className="admin-panel">
        <header className="admin-panel-head">
          <div>
            <h2>Transactions</h2>
            <p>{total} wallet transaction(s).</p>
          </div>
          <div className="admin-panel-tools">
            <button
              type="button"
              className={`admin-ghost-button${loading ? " is-busy" : ""}`}
              onClick={refresh}
              disabled={loading}
            >
              <FiRefreshCw className={loading ? "admin-spin" : ""} /> Refresh
            </button>
          </div>
        </header>

        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading && !data ? (
          <LoadingState label="Loading transactions…" />
        ) : items.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Wallet credits and debits will appear here."
          />
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const direction = directionOf(item);
                  return (
                    <tr
                      key={item.id}
                      className="admin-row-in"
                      style={{ "--row-index": index }}
                    >
                      <td>
                        <strong>{item.reference || item.id}</strong>
                        <small>{item.title}</small>
                      </td>
                      <td>
                        <strong>{item.customerName || "Customer"}</strong>
                        <small>{item.customerEmail}</small>
                      </td>
                      <td>
                        <span className="admin-type-tag">{item.type}</span>
                      </td>
                      <td
                        className={`admin-amount${
                          direction ? ` is-${direction}` : ""
                        }`}
                      >
                        {direction === "debit"
                          ? "−"
                          : direction === "credit"
                            ? "+"
                            : ""}
                        {formatNaira(item.amount)}
                      </td>
                      <td>
                        <span className="admin-status-tag">{item.status}</span>
                      </td>
                      <td>{formatDate(item.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default TransactionsPage;
