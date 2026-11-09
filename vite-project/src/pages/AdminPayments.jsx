import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminDeposits,
  fetchAdminStatus,
  fetchAdminVirtualAccounts,
  fetchAdminWebhooks,
} from "../services/apiClient";
import "../CSS/dashboard/pages/AdminPayments.css";

const PAGE_SIZE = 25;

function formatNaira(value) {
  return `₦${Number(value || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleString("en-NG");
}

function AdminPayments() {
  const [accounts, setAccounts] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [totals, setTotals] = useState({ accounts: 0, deposits: 0, webhooks: 0 });
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasAccess, setHasAccess] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      await fetchAdminStatus();
      setHasAccess(true);
      const options = {
        search: appliedSearch,
        status,
        limit: PAGE_SIZE,
        offset,
      };
      const [accountPage, depositPage, webhookPage] = await Promise.all([
        fetchAdminVirtualAccounts(options),
        fetchAdminDeposits(options),
        fetchAdminWebhooks({ limit: PAGE_SIZE, offset }),
      ]);
      setAccounts(accountPage.items || []);
      setDeposits(depositPage.items || []);
      setWebhooks(webhookPage.items || []);
      setTotals({
        accounts: Number(accountPage.total || 0),
        deposits: Number(depositPage.total || 0),
        webhooks: Number(webhookPage.total || 0),
      });
    } catch (loadError) {
      if (loadError?.status === 403) {
        setHasAccess(false);
        setError("Administrator access is not enabled for this account.");
      } else {
        setError(
          loadError?.message || "Payment operations could not be loaded.",
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [appliedSearch, offset, status]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return load();
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const submitSearch = (event) => {
    event.preventDefault();
    setOffset(0);
    setAppliedSearch(search.trim());
  };

  return (
    <section className="admin-payments">
      <header className="admin-payments-header">
        <div>
          <h1>Payment operations</h1>
          <p>Read-only NeuraPay account, deposit, and webhook records.</p>
        </div>
        <button
          type="button"
          className="admin-refresh-btn"
          onClick={load}
          disabled={isLoading}
        >
          {isLoading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && (
        <p className="admin-payments-error" role="alert">
          {error}
        </p>
      )}
      {hasAccess === false && (
        <p className="admin-payments-note">
          Add this verified account’s email to the server-side
          {" "}ADMIN_EMAILS allowlist to grant access.
        </p>
      )}

      {hasAccess !== false && (
        <>
          <div className="admin-payment-counts" aria-label="Record totals">
            <div><strong>{totals.accounts}</strong><span>Virtual accounts</span></div>
            <div><strong>{totals.deposits}</strong><span>Deposits</span></div>
            <div><strong>{totals.webhooks}</strong><span>Webhook events</span></div>
          </div>

          <form className="admin-payment-filters" onSubmit={submitSearch}>
            <label>
              Search customers or references
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                maxLength={100}
                placeholder="Name, email, account, transaction reference"
              />
            </label>
            <label>
              Deposit status
              <select
                value={status}
                onChange={(event) => {
                  setOffset(0);
                  setStatus(event.target.value);
                }}
              >
                <option value="">All statuses</option>
                <option value="CREDITED">Confirmed</option>
                <option value="PENDING">Pending</option>
                <option value="REVIEW">Under review</option>
                <option value="FAILED">Failed</option>
              </select>
            </label>
            <button type="submit" className="admin-refresh-btn">
              Search
            </button>
          </form>

          {isLoading ? (
            <p className="admin-payments-note" role="status">Loading payment records…</p>
          ) : (
            <>
              <section className="admin-payment-section">
                <h2>Virtual accounts</h2>
                {accounts.length === 0 ? (
                  <p className="admin-payments-note">No accounts in this page.</p>
                ) : (
                  <div className="admin-payment-list">
                    {accounts.map((account) => (
                      <article className="admin-payment-row" key={account.id}>
                        <div>
                          <strong>{account.userName || "Customer"}</strong>
                          <span>{account.userEmail}</span>
                        </div>
                        <div>
                          <strong>{account.accountNumber || "No account number"}</strong>
                          <span>{account.bankName || "Bank not reported"} · {account.status}</span>
                        </div>
                        <div>
                          <span>{account.provider} · {account.currency} · {account.mode}</span>
                          <span>Provider reference: {account.providerReference || "Not returned"}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="admin-payment-section">
                <h2>Deposits</h2>
                {deposits.length === 0 ? (
                  <p className="admin-payments-note">No deposits in this page.</p>
                ) : (
                  <div className="admin-payment-list">
                    {deposits.map((deposit) => (
                      <article className="admin-payment-row" key={deposit.id}>
                        <div>
                          <strong>{deposit.userName || "Customer"} · {deposit.status}</strong>
                          <span>{deposit.userEmail}</span>
                        </div>
                        <div>
                          <strong>{formatNaira(deposit.amount)} {deposit.currency}</strong>
                          <span>{formatDate(deposit.createdAt)}</span>
                        </div>
                        <div>
                          <span>Transaction ID: {deposit.transactionId}</span>
                          <span>Reference: {deposit.txRef || "Not reported"} · Provider: {deposit.providerReference || "Not reported"}</span>
                        </div>
                        {deposit.creditedAt && (
                          <div>
                            <span>Balance before: {formatNaira(deposit.previousBalance)}</span>
                            <span>Balance after: {formatNaira(deposit.newBalance)}</span>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="admin-payment-section">
                <h2>Webhook processing</h2>
                {webhooks.length === 0 ? (
                  <p className="admin-payments-note">No webhook events in this page.</p>
                ) : (
                  <div className="admin-payment-list">
                    {webhooks.map((event) => (
                      <article className="admin-payment-row" key={`${event.provider}-${event.eventKey}`}>
                        <div>
                          <strong>{event.provider} · {event.outcome || "Received"}</strong>
                          <span>{event.eventKey}</span>
                        </div>
                        <div>
                          <span>Received: {formatDate(event.receivedAt)}</span>
                          <span>Processed: {event.processedAt ? formatDate(event.processedAt) : "Not processed"}</span>
                        </div>
                        <div>
                          <span>Transaction ID: {event.payload?.transactionId || "Not reported"}</span>
                          <span>Event: {event.payload?.type || "Unknown"}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <div className="admin-payment-pagination">
                <button
                  type="button"
                  className="admin-refresh-btn"
                  onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                  disabled={offset === 0 || isLoading}
                >
                  Previous
                </button>
                <span>Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, Math.max(totals.accounts, totals.deposits, totals.webhooks))}</span>
                <button
                  type="button"
                  className="admin-refresh-btn"
                  onClick={() => setOffset((current) => current + PAGE_SIZE)}
                  disabled={isLoading || offset + PAGE_SIZE >= Math.max(totals.accounts, totals.deposits, totals.webhooks)}
                >
                  Next
                </button>
              </div>
              <p className="admin-payments-note">
                This dashboard is read-only. Deposits can only be credited by the
                verified NeuraPay webhook flow.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

export default AdminPayments;
