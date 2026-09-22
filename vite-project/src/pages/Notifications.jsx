import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FiBell, FiArrowRight, FiCheck } from "react-icons/fi";
import { useNotifications } from "../hooks/useNotifications";
import {
  markAllNotificationsRead,
  markNotificationRead,
  seedNotificationsOnce,
} from "../notifications/notificationStore";
import "../CSS/dashboard/pages/Notifications.css";

// Sample history, seeded once into the store so a brand-new account still has
// something to show. Real account actions append to the same store on top.
const sampleNotifications = [
  {
    type: "code",
    title: "Verification code received",
    description: "WhatsApp code 750529 arrived.",
    date: "18 Sept 2026, 02:09",
    path: "/my-numbers",
  },
  {
    type: "purchase",
    title: "Number purchased",
    description: "WhatsApp number +1 632 923 4808 is ready.",
    date: "18 Sept 2026, 02:00",
    path: "/my-numbers",
  },
  {
    type: "deposit",
    title: "Deposit successful",
    description: "Your wallet has been credited.",
    date: "17 Sept 2026, 23:19",
    path: "/transactions",
  },
  {
    type: "deposit",
    title: "Deposit successful",
    description: "Your wallet has been credited.",
    date: "17 Sept 2026, 23:16",
    path: "/transactions",
  },
  {
    type: "code",
    title: "Verification code received",
    description: "Telegram code 917414 arrived.",
    date: "07 Sept 2026, 07:55",
    path: "/my-numbers",
  },
  {
    type: "purchase",
    title: "Number purchased",
    description: "Telegram number +1 229 838 3490 is ready.",
    date: "07 Sept 2026, 07:52",
    path: "/my-numbers",
  },
];

function Notifications() {
  const { notifications, unreadCount } = useNotifications();
  const navigate = useNavigate();

  // Make sure the sample history exists before the first render reads it.
  useEffect(() => {
    seedNotificationsOnce(sampleNotifications);
  }, []);

  // Opening an individual notification clears its unread flag, which updates
  // the header badge immediately through the shared store.
  const handleCardClick = (item) => {
    markNotificationRead(item.id);
    if (item.path) {
      navigate(item.path);
    }
  };

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