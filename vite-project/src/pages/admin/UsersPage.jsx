import { useEffect, useState } from "react";
import {
  FiArrowLeft,
  FiFilter,
  FiRefreshCw,
  FiSearch,
  FiUserCheck,
  FiUserX,
  FiUsers,
} from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchAdminPresence,
  fetchAdminUser,
  fetchAdminUsers,
} from "../../services/apiClient";
import useAsyncResource from "../../hooks/useAsyncResource";
import {
  formatDate,
  formatNaira,
  formatRelative,
} from "./format";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  OnlineBadge,
  StatCard,
} from "./adminUi";
// Shared admin shell + primitives, then this page's own stylesheet.
import "../../CSS/dashboard/admin/admin.css";
import "../../CSS/dashboard/admin/AdminUsers.css";

const FILTERS = [
  { id: "", label: "All users" },
  { id: "online", label: "Online" },
  { id: "offline", label: "Offline" },
];

const POLL_MS = 30 * 1000;

/**
 * Users Management.
 *
 * Online/Offline comes from the backend's presence rule: a live session that has
 * sent a browser heartbeat in the last two minutes. It is deliberately NOT the
 * account's active/verified state, so a registered but closed customer reads
 * Offline. The list re-polls so the column stays honest without a refresh.
 */
function UsersPage() {
  const { id } = useParams();

  if (id) return <UserDetail userId={id} />;
  return <UsersList />;
}

function UsersList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [presence, setPresence] = useState("");

  const { loading, error, data, refresh, reload } =
    useAsyncResource(async () => {
      const [users, summary] = await Promise.all([
        fetchAdminUsers({ search: query, presence, limit: 50, offset: 0 }),
        fetchAdminPresence(),
      ]);
      return { users, summary };
    }, [presence]);

  // Poll: presence changes without anyone touching this page.
  useEffect(() => {
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  // Debounced search - one request after typing stops.
  useEffect(() => {
    if (search === query) return;
    const timer = setTimeout(() => setQuery(search), 350);
    return () => clearTimeout(timer);
  }, [search, query]);

  const users = data?.users?.items || [];
  const total = data?.users?.total ?? 0;

  return (
    <div className="admin-page-body admin-users-page">
      <div className="admin-stat-grid">
        <StatCard icon={FiUsers} label="Total users" value={total} />
        <StatCard
          icon={FiUserCheck}
          label="Online now"
          value={data?.summary?.online ?? "—"}
          hint="Heartbeat within 2 minutes"
          tone="green"
        />
        <StatCard
          icon={FiUserX}
          label="Offline"
          value={data?.summary?.offline ?? "—"}
          hint="No recent heartbeat"
          tone="red"
        />
        <StatCard
          icon={FiRefreshCw}
          label="Live status"
          value="Auto"
          hint="Refreshes every 30 seconds"
          tone="purple"
        />
      </div>

      <section
        className="admin-panel admin-enter"
        style={{ "--enter-delay": "60ms" }}
      >
        <header className="admin-panel-head">
          <div>
            <h2>Customers</h2>
            <p>
              {total} account{total === 1 ? "" : "s"}
              {presence ? ` · ${presence} only` : ""}
            </p>
          </div>
          <div className="admin-panel-tools">
            <label className="admin-search">
              <FiSearch />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email or phone"
                aria-label="Search users"
              />
            </label>
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

        <div className="admin-filter-row">
          <span className="admin-filter-label">
            <FiFilter /> Status
          </span>
          {FILTERS.map((filter) => (
            <button
              key={filter.id || "all"}
              type="button"
              className={`admin-chip${presence === filter.id ? " active" : ""}`}
              onClick={() => setPresence(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading && !data ? (
          <LoadingState label="Loading customers…" />
        ) : users.length === 0 ? (
          <EmptyState
            title="No customers match this view"
            description="Clear the search or switch the status filter."
          />
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Phone</th>
                  <th>Wallet</th>
                  <th>Role</th>
                  <th>Online status</th>
                  <th>Joined</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {users.map((user, index) => (
                  <tr
                    key={user.id}
                    className="admin-row-in"
                    style={{ "--row-index": index }}
                  >
                    <td>
                      <span className="admin-user-cell">
                        <span className="admin-avatar-sm">
                          {(user.name || "?").charAt(0).toUpperCase()}
                        </span>
                        <span>
                          <strong>{user.name}</strong>
                          <small>{user.email}</small>
                        </span>
                      </span>
                    </td>
                    <td>{user.phone || "Not reported"}</td>
                    <td className="admin-amount">
                      {formatNaira(user.walletBalance)}
                    </td>
                    <td>
                      <span className="admin-role-tag">{user.role}</span>
                    </td>
                    <td>
                      <OnlineBadge online={user.online} />
                      <small className="admin-presence-seen">
                        {user.lastSeenAt
                          ? `Seen ${formatRelative(user.lastSeenAt)}`
                          : "Never signed in"}
                      </small>
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-link-button"
                        onClick={() => navigate(`/admin/users/${user.id}`)}
                      >
                        View details
                      </button>
                    </td>
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

function UserDetail({ userId }) {
  const navigate = useNavigate();
  const {
    loading,
    error,
    data: user,
  } = useAsyncResource(() => fetchAdminUser(userId), [userId]);

  const stats = [
    { label: "Wallet balance", value: formatNaira(user?.walletBalance) },
    { label: "Numbers purchased", value: user?.numbers?.length ?? 0 },
    { label: "Transactions", value: user?.transactions?.length ?? 0 },
    { label: "Deposits", value: user?.deposits?.length ?? 0 },
  ];

  return (
    <div className="admin-page-body admin-users-page">
      <button
        type="button"
        className="admin-back-button"
        onClick={() => navigate("/admin/users")}
      >
        <FiArrowLeft /> Back to users
      </button>

      {error ? (
        <ErrorState message={error} onRetry={() => navigate("/admin/users")} />
      ) : loading || !user ? (
        <LoadingState label="Loading customer…" />
      ) : (
        <>
          <section className="admin-panel">
            <header className="admin-panel-head">
              <div className="admin-user-cell is-large">
                <span className="admin-avatar-lg">
                  {(user.fullName || user.name || "?").charAt(0).toUpperCase()}
                </span>
                <span>
                  <h2>{user.fullName || user.name}</h2>
                  <p>{user.email}</p>
                </span>
              </div>
              <OnlineBadge online={user.online} />
            </header>
            <dl className="admin-detail-list">
              <div>
                <dt>Phone</dt>
                <dd>{user.phone || "Not reported"}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{user.role}</dd>
              </div>
              <div>
                <dt>Last seen</dt>
                <dd>
                  {user.lastSeenAt
                    ? formatRelative(user.lastSeenAt)
                    : "Never signed in"}
                </dd>
              </div>
              <div>
                <dt>Joined</dt>
                <dd>{formatDate(user.createdAt)}</dd>
              </div>
              <div>
                <dt>Email verified</dt>
                <dd>{user.emailVerified ? "Yes" : "No"}</dd>
              </div>
            </dl>
          </section>

          <div className="admin-stat-grid">
            {stats.map((stat, index) => (
              <article
                className="admin-stat-card admin-enter"
                key={stat.label}
                style={{ "--enter-delay": `${80 + index * 40}ms` }}
              >
                <div>
                  <small>{stat.label}</small>
                  <strong>{stat.value}</strong>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default UsersPage;
