/**
 * Wallet & Payments - /admin/payments
 *
 * Data comes from fetchAdminDeposits + fetchAdminPaymentSummary (unchanged
 * endpoints). Styling: admin/admin.css (shared) + admin/AdminPayments.css
 * (scoped to `.admin-payments-page`).
 */
import { useState } from "react";
import { FiCreditCard, FiRefreshCw, FiSearch } from "react-icons/fi";
import {
  fetchAdminDeposits,
  fetchAdminPaymentSummary,
} from "../../services/apiClient";
import useAsyncResource from "../../hooks/useAsyncResource";
import { formatDate, formatNaira, formatNumber } from "./format";
import { EmptyState, ErrorState, LoadingState, StatCard } from "./adminUi";
import "../../CSS/dashboard/admin/admin.css";
import "../../CSS/dashboard/admin/AdminPayments.css";

function PaymentsPage() {
  const [search, setSearch] = useState("");
  const { loading, error, data, refresh } = useAsyncResource(async () => {
    const [deposits, summary] = await Promise.all([
      fetchAdminDeposits({ limit: 25, offset: 0 }),
      fetchAdminPaymentSummary(),
    ]);
    return { deposits, summary };
  });

  const deposits = data?.deposits;
  const summary = data?.summary;
  const provider = summary?.provider;

  const items = (deposits?.items || []).filter((item) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [
      item.reference,
      item.id,
      item.customerName,
      item.customerEmail,
      item.status,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });

  return (
    <div className="admin-page-body admin-payments-page">
      {error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : loading && !data ? (
        <LoadingState label="Loading payment records…" />
      ) : (
        <>
          <div className="admin-stat-grid">
            <StatCard
              icon={FiCreditCard}
              label="Wallet liabilities"
              value={formatNaira(summary?.wallets?.liabilities)}
            />
            <StatCard
              icon={FiCreditCard}
              label="Confirmed deposits"
              value={formatNaira(summary?.deposits?.creditedTotal)}
              hint={`${formatNumber(summary?.deposits?.credited ?? 0)} credited`}
              tone="green"
            />
            <StatCard
              icon={FiCreditCard}
              label="Pending"
              value={formatNumber(summary?.deposits?.pending ?? 0)}
              tone="amber"
            />
            <StatCard
              icon={FiCreditCard}
              label="Provider"
              value={provider ? String(provider.mode).toUpperCase() : "—"}
              hint={
                provider?.configured
                  ? "Configured"
                  : `Not configured: ${(provider?.missing || []).join(", ") || "—"}`
              }
              tone={provider?.configured ? "green" : "red"}
            />
          </div>

          <section className="admin-panel">
            <header className="admin-panel-head">
              <div>
                <h2>Recent deposits</h2>
                <p>Newest bank-transfer deposits across all accounts.</p>
              </div>
              <div className="admin-panel-tools">
                <label className="admin-search">
                  <FiSearch aria-hidden="true" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search reference or customer"
                    aria-label="Search deposits"
                  />
                </label>
                <button
                  type="button"
                  className={`admin-ghost-button${loading ? " is-busy" : ""}`}
                  onClick={refresh}
                  disabled={loading}
                >
                  <FiRefreshCw className={loading ? "admin-spin" : ""} />{" "}
                  Refresh
                </button>
              </div>
            </header>

            {items.length === 0 ? (
              <EmptyState
                title="No deposits yet"
                description="Credited bank transfers will be listed here."
              />
            ) : (
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Customer</th>
                      <th>Amount</th>
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
                          <strong className="admin-reference">
                            {item.reference || item.id}
                          </strong>
                        </td>
                        <td>
                          <strong>{item.customerName || "Customer"}</strong>
                          <small>{item.customerEmail}</small>
                        </td>
                        <td className="admin-amount">
                          {formatNaira(item.amount)}
                        </td>
                        <td>
                          <span className="admin-status-tag">
                            {item.status}
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
        </>
      )}
    </div>
  );
}

export default PaymentsPage;
