/**
 * Notifications - /admin/notifications
 *
 * The header bell used to open this list; keeping it as a real page means the
 * bell never lands on a redirect. Data: fetchNotifications (unchanged).
 */
import { FiBell, FiRefreshCw } from "react-icons/fi";
import { fetchNotifications } from "../../services/apiClient";
import useAsyncResource from "../../hooks/useAsyncResource";
import { formatDate } from "./format";
import { EmptyState, ErrorState, LoadingState } from "./adminUi";
import "../../CSS/dashboard/admin/admin.css";
import "../../CSS/dashboard/admin/AdminNotifications.css";

function NotificationsPage() {
  const { loading, error, data, refresh } = useAsyncResource(() =>
    fetchNotifications(),
  );
  const items = data?.items || [];

  return (
    <div className="admin-page-body admin-notifications-page">
      <section className="admin-panel">
        <header className="admin-panel-head">
          <div>
            <h2>Notifications</h2>
            <p>{data?.unreadCount ?? 0} unread.</p>
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
          <LoadingState label="Loading notifications…" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={FiBell}
            title="No notifications"
            description="Announcement delivery and account activity will appear here."
          />
        ) : (
          <ul className="admin-notification-list">
            {items.map((item) => (
              <li key={item.id} className={item.read ? "" : "is-unread"}>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
                <small>{formatDate(item.createdAt)}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default NotificationsPage;
