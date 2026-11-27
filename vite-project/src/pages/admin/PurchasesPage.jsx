/**
 * Purchases - /admin/purchases
 *
 * Data comes from fetchAdminPurchases (the same endpoint the old
 * AdminManagement screen used). Styling: admin/admin.css (shared shell +
 * primitives) and admin/AdminPurchases.css (scoped to `.admin-purchases-page`).
 */
import { FiRefreshCw, FiShoppingBag } from "react-icons/fi";
import { fetchAdminPurchases } from "../../services/apiClient";
import useAsyncResource from "../../hooks/useAsyncResource";
import { formatDate, formatNaira, formatNumber } from "./format";
import { EmptyState, ErrorState, LoadingState, StatCard } from "./adminUi";
import "../../CSS/dashboard/admin/admin.css";
import "../../CSS/dashboard/admin/AdminPurchases.css";

function statusClass(status) {
  const value = String(status || "").toLowerCase();
  if (["completed", "delivered", "success", "successful"].includes(value))
    return "is-delivered";
  if (["pending", "processing"].includes(value)) return "is-pending";
  if (["failed", "cancelled", "canceled", "refunded"].includes(value))
    return "is-failed";
  return "";
}

function PurchasesPage() {
  const { loading, error, data, refresh } = useAsyncResource(() =>
    fetchAdminPurchases({ limit: 50, offset: 0 }),
  );

  const items = data?.items || [];
  const total = data?.total ?? items.length;
  const revenue = items.reduce(
    (sum, item) => sum + Number(item.priceValue || 0),
    0,
  );

  return (
    <div className="admin-page-body admin-purchases-page">
      <div className="admin-stat-grid">
        <StatCard icon={FiShoppingBag} label="Numbers sold" value={total} />
        <StatCard
          icon={FiShoppingBag}
          label="Value (latest 50)"
          value={formatNaira(revenue)}
          tone="green"
        />
        <StatCard
          icon={FiShoppingBag}
          label="Showing"
          value={formatNumber(items.length)}
          hint="Most recent purchases"
          tone="purple"
        />
      </div>

      <section className="admin-panel">
        <header className="admin-panel-head">
          <div>
            <h2>Purchases</h2>
            <p>{total} number(s) sold.</p>
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
          <LoadingState label="Loading purchases…" />
        ) : items.length === 0 ? (
          <EmptyState
            title="No purchases yet"
            description="Numbers bought by customers will appear here."
          />
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Purchase</th>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr
                    key={item.id}
                    className="admin-row-in"
                    style={{ "--row-index": index }}
                  >
                    <td>
                      <strong>{item.id}</strong>
                      <small>{item.number}</small>
                    </td>
                    <td>
                      <strong>{item.customerName || "Customer"}</strong>
                      <small>{item.customerEmail}</small>
                    </td>
                    <td>
                      <strong>{item.service}</strong>
                      <small>{item.countryName}</small>
                    </td>
                    <td className="admin-amount">
                      {formatNaira(item.priceValue)}
                    </td>
                    <td>
                      <span
                        className={`admin-status-tag ${statusClass(item.status)}`}
                      >
                        {item.status || "Unknown"}
                      </span>
                    </td>
                    <td>{formatDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default PurchasesPage;
