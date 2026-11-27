/**
 * Admin & Staff - /admin/staff
 *
 * Uses fetchAdminStaff (staff = every role except "customer"). If that endpoint
 * is unavailable the screen shows its error state - it never invents data.
 * Styling: admin/admin.css (shared) + admin/AdminStaff.css (page scoped).
 */
import { FiRefreshCw, FiShield, FiUserCheck, FiUsers } from "react-icons/fi";
import { fetchAdminStaff } from "../../services/apiClient";
import useAsyncResource from "../../hooks/useAsyncResource";
import { formatDate, formatNumber, formatRelative } from "./format";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  OnlineBadge,
  StatCard,
} from "./adminUi";
import "../../CSS/dashboard/admin/admin.css";
import "../../CSS/dashboard/admin/AdminStaff.css";

function StaffPage() {
  const { loading, error, data, refresh } = useAsyncResource(() =>
    fetchAdminStaff({ limit: 200, offset: 0 }),
  );

  const items = data?.items || [];
  const online = items.filter((user) => user.online).length;
  const admins = items.filter((user) =>
    ["admin", "super_admin", "owner"].includes(
      String(user.role || "").toLowerCase(),
    ),
  ).length;
  const agents = items.filter(
    (user) => String(user.role || "").toLowerCase() === "agent",
  ).length;

  return (
    <div className="admin-page-body admin-staff-page">
      <div className="admin-stat-grid">
        <StatCard icon={FiUsers} label="Staff accounts" value={items.length} />
        <StatCard
          icon={FiShield}
          label="Admins"
          value={formatNumber(admins)}
          tone="purple"
        />
        <StatCard
          icon={FiUserCheck}
          label="Agents"
          value={formatNumber(agents)}
          tone="amber"
        />
        <StatCard
          icon={FiUserCheck}
          label="Online now"
          value={formatNumber(online)}
          hint="Heartbeat within 2 minutes"
          tone="green"
        />
      </div>

      <section className="admin-panel">
        <header className="admin-panel-head">
          <div>
            <h2>Admin &amp; Staff</h2>
            <p>{items.length} staff account(s).</p>
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
          <LoadingState label="Loading staff…" />
        ) : items.length === 0 ? (
          <EmptyState
            title="No staff accounts yet"
            description="Administrators and agents will appear here once their roles are assigned."
          />
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Role</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Online status</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {items.map((user, index) => (
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
                    <td>
                      <span className="admin-role-tag">{user.role}</span>
                    </td>
                    <td>{user.email}</td>
                    <td>{user.phone || "Not reported"}</td>
                    <td>
                      <OnlineBadge online={user.online} />
                      {user.lastSeenAt ? (
                        <small className="admin-presence-seen">
                          Seen {formatRelative(user.lastSeenAt)}
                        </small>
                      ) : null}
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
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

export default StaffPage;
