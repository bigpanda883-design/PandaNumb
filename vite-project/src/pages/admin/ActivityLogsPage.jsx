import { useEffect, useState } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiFilter,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiUsers,
} from "react-icons/fi";

import { fetchAdminActivityLogs } from "../../services/apiClient";
import useAsyncResource from "../../hooks/useAsyncResource";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatCard,
} from "./adminUi";
import { formatDate, formatNumber } from "./format";
// Shared admin shell + primitives, then this page's own stylesheet.
import "../../CSS/dashboard/admin/admin.css";
import "../../CSS/dashboard/admin/AdminActivityLogs.css";

const PAGE_SIZE = 50;

const ACTION_FILTERS = [
  { id: "", label: "All actions" },
  { id: "auth.login", label: "Administrator login" },
  { id: "auth.logout", label: "Administrator logout" },
  { id: "price.updated", label: "Price updated" },
  { id: "price.bulk_updated", label: "Bulk price update" },
  { id: "price.override_removed", label: "Custom price removed" },
  { id: "inventory.service_enabled", label: "Service enabled" },
  { id: "inventory.service_disabled", label: "Service disabled" },
  { id: "inventory.refreshed", label: "Inventory refreshed" },
  { id: "announcement.sent", label: "Announcement published" },
  { id: "announcement.draft_saved", label: "Draft saved" },
  { id: "announcement.draft_deleted", label: "Draft deleted" },
  { id: "profile.updated", label: "Profile updated" },
  { id: "security.session_revoked", label: "Session terminated" },
  { id: "security.other_sessions_ended", label: "Other sessions ended" },
  { id: "security.two_factor_changed", label: "Two-factor changed" },
  { id: "system.maintenance_mode", label: "Maintenance mode" },
];

function ActivityLogsPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);

  const { loading, error, data, refresh } = useAsyncResource(
    () =>
      fetchAdminActivityLogs({
        search: query,
        action,
        actorId,
        status,
        from,
        to,
        limit: PAGE_SIZE,
        offset,
      }),
    [query, action, actorId, status, from, to, offset],
  );

  // Debounced search
  useEffect(() => {
    if (search === query) return;

    const timer = setTimeout(() => {
      setQuery(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, query]);

  const resetFilters = () => {
    setSearch("");
    setQuery("");
    setAction("");
    setActorId("");
    setStatus("");
    setFrom("");
    setTo("");
    setOffset(0);
  };

  const items = data?.items || [];
  const stats = data?.stats;
  const total = data?.total || 0;

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="admin-page-body admin-activity-page">
      {/* Statistics */}
      <div className="admin-stat-grid">
        <StatCard
          icon={FiActivity}
          label="Total activities"
          value={formatNumber(stats?.total)}
        />

        <StatCard
          icon={FiShield}
          label="Admin actions"
          value={formatNumber(stats?.admin)}
          tone="purple"
        />

        <StatCard
          icon={FiUsers}
          label="Staff actions"
          value={formatNumber(stats?.staff)}
          tone="orange"
        />

        <StatCard
          icon={FiAlertTriangle}
          label="Security events"
          value={formatNumber(stats?.security)}
          tone="red"
        />
      </div>

      {/* Audit Trail */}
      <section className="admin-panel">
        <header className="admin-panel-head">
          <div>
            <h2>Audit trail</h2>
            <p>
              Append-only record of privileged actions. {formatNumber(total)}{" "}
              matching event
              {total === 1 ? "" : "s"}.
            </p>
          </div>

          <div className="admin-panel-tools">
            <label className="admin-search">
              <FiSearch />

              <input
                value={search}
                onChange={(event) => {
                  setOffset(0);
                  setSearch(event.target.value);
                }}
                placeholder="Search actor, action or record"
                aria-label="Search activity logs"
              />
            </label>

            <button
              type="button"
              className="admin-ghost-button"
              onClick={refresh}
            >
              <FiRefreshCw />
              Refresh
            </button>
          </div>
        </header>

        {/* Filters */}
        <div className="admin-filter-grid is-logs">
          <label>
            <span>Administrator</span>

            <select
              value={actorId}
              onChange={(event) => {
                setOffset(0);
                setActorId(event.target.value);
              }}
            >
              <option value="">All actors</option>

              {(data?.actors || []).map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name} ({actor.count})
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Action type</span>

            <select
              value={action}
              onChange={(event) => {
                setOffset(0);
                setAction(event.target.value);
              }}
            >
              {ACTION_FILTERS.map((entry) => (
                <option key={entry.id || "all"} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Status</span>

            <select
              value={status}
              onChange={(event) => {
                setOffset(0);
                setStatus(event.target.value);
              }}
            >
              <option value="">Any status</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="failed">Failed</option>
            </select>
          </label>

          <label>
            <span>From</span>

            <input
              type="date"
              value={from}
              onChange={(event) => {
                setOffset(0);
                setFrom(event.target.value);
              }}
            />
          </label>

          <label>
            <span>To</span>

            <input
              type="date"
              value={to}
              onChange={(event) => {
                setOffset(0);
                setTo(event.target.value);
              }}
            />
          </label>

          <button
            type="button"
            className="admin-ghost-button"
            onClick={resetFilters}
          >
            <FiFilter />
            Clear filters
          </button>
        </div>

        {/* Content */}
        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading && !data ? (
          <LoadingState label="Loading audit trail..." />
        ) : items.length === 0 ? (
          <EmptyState
            title="No activity matches this view"
            description="Audit entries appear as administrators change prices, send announcements or update settings."
          />
        ) : (
          <>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Affected record</th>
                    <th>Date &amp; time</th>
                    <th>IP address</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((item, index) => (
                    <tr
                      key={item.id || index}
                      className="admin-row-in"
                      style={{ "--row-index": index }}
                    >
                      <td>
                        <code className="admin-code">
                          {String(item.id || "—").slice(0, 8)}
                        </code>
                      </td>

                      <td>
                        <strong>{item.actorName || "System"}</strong>
                        <small>
                          {item.actorRole || item.actorType || "System"}
                        </small>
                      </td>

                      <td>
                        <strong>{item.actionLabel || "Activity"}</strong>
                        <small>{item.action || "—"}</small>
                      </td>

                      <td>
                        {item.targetLabel || "—"}
                        {item.detail ? <small>{item.detail}</small> : null}
                      </td>

                      <td>{formatDate(item.createdAt)}</td>

                      <td>{item.ipAddress || "—"}</td>

                      <td>
                        <span
                          className={`admin-status-tag is-${item.status || "unknown"}`}
                        >
                          {item.status || "Unknown"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="admin-pagination">
              <button
                type="button"
                className="admin-ghost-button"
                onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
                disabled={offset === 0}
              >
                Previous
              </button>

              <span>
                Page {page} of {pages}
              </span>

              <button
                type="button"
                className="admin-ghost-button"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={page >= pages}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default ActivityLogsPage;
