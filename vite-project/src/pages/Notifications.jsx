import { useNavigate, Link } from "react-router-dom";
import { FiBell, FiArrowRight, FiCheck } from "react-icons/fi";
import { useNotifications } from "../hooks/useNotifications";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "../notifications/notificationStore";
import "../CSS/dashboard/pages/Notifications.css";
import { usePageLoading } from "../hooks/usePageLoading";
import { NotificationsSkeleton } from "../components/skeleton/PageSkeletons";

// No sample/demo history: a new account must start empty, so every notification
// here comes from a real action recorded by the shared store.
function Notifications() {
  const { notifications, unreadCount } = useNotifications();
  const navigate = useNavigate();
  const { isLoading } = usePageLoading();

  // Opening an individual notification clears its unread flag, which updates
  // the header badge immediately through the shared store.
  const handleCardClick = (item) => {
    markNotificationRead(item.id);
    if (item.path) {
      navigate(item.path);
    }
  };

  if (isLoading) return <NotificationsSkeleton />;

  return (
    <section className="notifications-page-container">
      <div className="notifications-header">
        <h1>Notifications</h1>
        <p>
          {unreadCount > 0
            ? `You have ${unreadCount} unread notification${
                unreadCount === 1 ? "" : "s"
              }.`
            : "Everything happening on your account."}
        </p>
        {unreadCount > 0 && (
          <button
            type="button"
            className="notifications-mark-all-btn"
            onClick={markAllNotificationsRead}
          >
            <FiCheck aria-hidden="true" />
            Mark all as read
          </button>
        )}
      </div>

      <div className="notifications-list-wrapper">
        {notifications.length > 0 ? (
          notifications.map((item) => (
            <div
              key={item.id}
              className={`notification-card${
                item.read ? "" : " notification-card-unread"
              }`}
              role="button"
              tabIndex={0}
              onClick={() => handleCardClick(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleCardClick(item);
                }
              }}
            >
              <h2 className="notification-title">{item.title}</h2>
              <p className="notification-description">{item.description}</p>
              <span className="notification-date">{item.date}</span>
              {!item.read && (
                <span className="notification-unread-dot" aria-label="Unread" />
              )}
            </div>
          ))
        ) : (
          /* Empty State Fallback */
          <div className="notification-empty-card">
            <FiBell className="empty-bell-icon" />
            <h2>No new notifications</h2>
            <p>Important account updates will appear here.</p>
            <Link to="/dashboard" className="back-dashboard-btn">
              Back to dashboard <FiArrowRight />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

export default Notifications;
