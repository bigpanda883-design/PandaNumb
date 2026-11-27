// Throwaway: reproduce deliverAnnouncement against the test DB.
import * as m from "../server/db.js";

const users = m.default.prepare("SELECT id, email FROM users").all();
console.log("users:", users.length);

const a = m.createAnnouncement({
  title: "Test",
  body: "Hello",
  audience: "all",
  status: "sending",
  createdBy: "x",
  createdByEmail: "x@y.z",
});
console.log("created:", a.id, a.status);

try {
  const result = m.deliverAnnouncement({
    announcementId: a.id,
    userIds: users.map((u) => u.id),
    title: "Test",
    body: "Hello",
  });
  console.log("delivered:", result);
} catch (error) {
  console.log("DELIVERY ERROR:", error.message);
  console.log(error.stack);
}
