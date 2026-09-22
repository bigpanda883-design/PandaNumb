import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FiBell, FiArrowRight } from "react-icons/fi";
import "../CSS/dashboard/pages/Notifications.css";

const initialNotifications = [
  {
    id: 1,
    type: "code",
    title: "Verification code received",
    description: "WhatsApp code 750529 arrived.",
    date: "18 Sept 2026, 02:09",
    path: "/my-numbers"
  },
  {
    id: 2,
    type: "purchase",
    title: "Number purchased",
    description: "WhatsApp number +1 632 923 4808 is ready.",
    date: "18 Sept 2026, 02:00",
    path: "/my-numbers"
  },
  {
    id: 3,
    type: "deposit",
    title: "Deposit successful",
    description: "Your wallet has been credited.",
    date: "17 Sept 2026, 23:19",
    path: "/transactions"
  },
  {
    id: 4,
    type: "deposit",
    title: "Deposit successful",
    description: "Your wallet has been credited.",
    date: "17 Sept 2026, 23:16",
    path: "/transactions"
  },
  {
    id: 5,
    type: "deposit",
    title: "Deposit successful",
    description: "Your wallet has been credited.",
    date: "07 Sept 2026, 08:30",
    path: "/transactions"
  },
  {
    id: 6,
    type: "code",
    title: "Verification code received",
    description: "Telegram code 917414 arrived.",
    date: "07 Sept 2026, 07:55",
    path: "/my-numbers"
  },
  {
    id: 7,
    type: "purchase",
    title: "Number purchased",
    description: "Telegram number +1 229 838 3490 is ready.",
    date: "07 Sept 2026, 07:52",
    path: "/my-numbers"
  },
  {
    id: 8,
    type: "deposit",
    title: "Deposit successful",
    description: "Your wallet has been credited.",
    date: "22 Aug 2026, 19:32",
    path: "/transactions"
  }
];

function Notifications() {
  const [notifications] = useState(initialNotifications);
  const navigate = useNavigate();

  const handleCardClick = (path) => {
    if (path) {
      navigate(path);
    }
  };

  return (
    <section className="notifications-page-container">
      <div className="notifications-header">
        <h1>Notifications</h1>
        <p>Everything happening on your account.</p>
      </div>

      <div className="notifications-list-wrapper">
        {notifications.length > 0 ? (
          notifications.map((item) => (
            <div
              key={item.id}
              className="notification-card"
              role="button"
              tabIndex={0}
              onClick={() => handleCardClick(item.path)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleCardClick(item.path);
                }
              }}
            >
              <h2 className="notification-title">{item.title}</h2>
              <p className="notification-description">{item.description}</p>
              <span className="notification-date">{item.date}</span>
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