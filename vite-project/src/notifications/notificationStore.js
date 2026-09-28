/**
 * Panda Numbers - notification store
 * -------------------------------------------------
 * A tiny persisted store the whole app shares. Every important account action
 * calls `pushNotification(...)` and the dashboard bell derives its badge from
 * `unreadCount`, so the number is always the real data, never a hardcoded value.
 *
 * It follows the same localStorage + custom-event pattern as authStorage, which
 * keeps the header, the notifications page and any page that fires an event in
 * sync without adding a dependency or a global provider.
 */
const NOTIFICATIONS_STORAGE_KEY = "panda-numbers-notifications";

// Same "DD MMM YYYY, HH:MM" shape the notifications UI already renders.
export function formatNotificationDate(date = new Date()) {
  const dateStr = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${dateStr}, ${timeStr}`;
}

function readStore() {
  try {
    const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(notifications) {
  try {
    localStorage.setItem(
      NOTIFICATIONS_STORAGE_KEY,
      JSON.stringify(notifications),
    );
  } catch {
    // Storage can be unavailable (private mode, quota). The in-memory copy the
    // components hold still works for the current session.
  }
  // Let every subscribed component know, in this tab and in other tabs.
  window.dispatchEvent(new CustomEvent("panda-notifications-change"));
}

export function getNotifications() {
  return readStore();
}

export function getUnreadCount() {
  return readStore().filter((item) => !item.read).length;
}

/**
 * NOTE: notifications are never seeded.
 *
 * A brand-new account must start with an empty notification list, so the store
 * deliberately holds nothing until a real account action records one. Any
 * sample/demo history would show a new user activity that never happened.
 */

/**
 * Record an account activity as a notification.
 *
 * @param {object} notification
 * @param {string} notification.type    "purchase" | "deposit" | "code" | "security" | ...
 * @param {string} notification.title   Short headline, e.g. "Number purchased".
 * @param {string} notification.description  One-line detail.
 * @param {string} [notification.path]  Where clicking the card should navigate.
 * @param {boolean} [notification.read] Defaults to unread.
 */
export function pushNotification({
  type,
  title,
  description,
  path,
  read = false,
  date = new Date(),
}) {
  if (!title) return null;

  const notification = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `n-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    title,
    description,
    path,
    read,
    date: formatNotificationDate(date),
    createdAt: date.getTime(),
  };

  // Newest first, matching how the page lists them.
  writeStore([notification, ...readStore()]);
  return notification;
}

/** Mark a single notification read by id. */
export function markNotificationRead(id) {
  const next = readStore().map((item) =>
    item.id === id ? { ...item, read: true } : item,
  );
  writeStore(next);
}

/** Mark every notification read - used when the user clears them all. */
export function markAllNotificationsRead() {
  const next = readStore().map((item) =>
    item.read ? item : { ...item, read: true },
  );
  writeStore(next);
}

/** Remove a single notification. */
export function removeNotification(id) {
  writeStore(readStore().filter((item) => item.id !== id));
}

export function clearNotifications() {
  writeStore([]);
}

/** Subscribe to changes; returns an unsubscribe function. */
export function subscribeToNotifications(callback) {
  const handler = () => callback();
  window.addEventListener("panda-notifications-change", handler);
  // Keep multiple tabs consistent.
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("panda-notifications-change", handler);
    window.removeEventListener("storage", handler);
  };
}
