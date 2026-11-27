// Throwaway verification of the new schema + helpers. Deleted after the run.
import * as m from "../server/db.js";

const db = m.default;
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all()
  .map((r) => r.name);
console.log("tables:", tables.join(", "));
console.log(
  "users cols:",
  db
    .prepare("PRAGMA table_info(users)")
    .all()
    .map((c) => c.name)
    .join(","),
);
console.log(
  "sessions cols:",
  db
    .prepare("PRAGMA table_info(sessions)")
    .all()
    .map((c) => c.name)
    .join(","),
);
console.log("announcement stats:", JSON.stringify(m.getAnnouncementStats()));
console.log("activity stats:", JSON.stringify(m.getActivityLogStats()));
