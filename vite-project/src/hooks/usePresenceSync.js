import { useEffect } from "react";
import {
  fetchNotifications,
  sendPresenceHeartbeat,
} from "../services/apiClient";
import { syncServerNotifications } from "../notifications/notificationStore";

/**
 * How often the browser tells the backend "I am still here".
 *
 * The server treats a session as ONLINE only while its last heartbeat is inside
 * its presence window (2 minutes), so this must be comfortably shorter. A
 * customer who closes the tab simply stops sending and goes Offline - which is
 * exactly what the admin console shows.
 */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/**
 * Keep this signed-in session marked online and pull announcements the admin
 * sent from the announcement composer.
 *
 * Mounted once per protected shell (customer dashboard and admin console).
 * Failures are ignored: a missed heartbeat degrades to "offline", it must never
 * break the page the customer is using.
 */
export default function usePresenceSync({ notifications = false } = {}) {
  useEffect(() => {
    let cancelled = false;

    const beat = () => {
      if (cancelled) return;
      sendPresenceHeartbeat().catch(() => {
        // Offline, backend asleep, or signed out: the next tick retries.
      });
    };

    const pullNotifications = () => {
      if (cancelled) return;
      fetchNotifications()
        .then((payload) => {
          if (!cancelled) syncServerNotifications(payload?.items || []);
        })
        .catch(() => {
          // Keep whatever is already stored.
        });
    };

    beat();
    if (notifications) pullNotifications();

    const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    // A backgrounded tab throttles timers; refresh on focus so the session does
    // not drop offline while the user is actually looking at the page again.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        beat();
        if (notifications) pullNotifications();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [notifications]);
}
