import { useEffect, useState } from "react";
import {
  getNotifications,
  getUnreadCount,
  subscribeToNotifications,
} from "../notifications/notificationStore";

/**
 * Subscribe a component to the notification store.
 * Returns the full list plus the live unread count, re-rendering whenever any
 * page records a new notification or marks one read.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState(getNotifications);
  const [unreadCount, setUnreadCount] = useState(getUnreadCount);

  useEffect(() => {
    const sync = () => {
      setNotifications(getNotifications());
      setUnreadCount(getUnreadCount());
    };
    // Re-sync on mount in case something changed between the initial state
    // read and the effect attaching the listener.
    sync();
    return subscribeToNotifications(sync);
  }, []);

  return { notifications, unreadCount };
}
