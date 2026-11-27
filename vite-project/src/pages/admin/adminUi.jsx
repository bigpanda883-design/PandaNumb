/**
 * Shared helpers for the admin console pages.
 *
 * Kept in one place so currency, dates, badges and the empty/error states look
 * identical on every screen instead of each page inventing its own.
 */
import { FiAlertCircle, FiInbox, FiLoader } from "react-icons/fi";

/** Green when online, red when offline - never yellow (that is for Idle later). */
export function OnlineBadge({ online }) {
  return (
    <span
      className={`admin-presence-badge ${online ? "is-online" : "is-offline"}`}
      title={
        online
          ? "Active session with a heartbeat in the last 2 minutes"
          : "No active session, or no heartbeat in the last 2 minutes"
      }
    >
      <i aria-hidden="true" />
      {online ? "Online" : "Offline"}
    </span>
  );
}

export function StatCard({ icon: Icon, label, value, hint, tone = "blue" }) {
  return (
    <article className="admin-stat-card">
      <span className={`admin-stat-icon ${tone}`}>
        {Icon ? <Icon /> : null}
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {hint ? <p>{hint}</p> : null}
      </div>
    </article>
  );
}

export function EmptyState({ title, description, icon: Icon = FiInbox }) {
  return (
    <div className="admin-state-card">
      <Icon />
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="admin-state-card is-error">
      <FiAlertCircle />
      <h3>Could not load this data</h3>
      <p>{message || "The server did not answer. Please try again."}</p>
      {onRetry ? (
        <button type="button" className="admin-action-button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function LoadingState({ label = "Loading live records…" }) {
  return (
    <div className="admin-state-card">
      <FiLoader className="admin-spin" />
      <p>{label}</p>
    </div>
  );
}

/** Compact inline alert used for save results. */
export function Notice({ tone = "success", children, onClose }) {
  if (!children) return null;
  return (
    <div className={`admin-notice ${tone}`} role="status">
      <span>{children}</span>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}

export function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`admin-modal${wide ? " is-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-modal-header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>
  );
}
