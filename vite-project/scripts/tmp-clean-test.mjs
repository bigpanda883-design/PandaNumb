import Database from "better-sqlite3";

const db = new Database("server/data/panda.db");
const rows = db
  .prepare(
    "SELECT id, email, created_at FROM users WHERE email LIKE 'perf.%' OR email LIKE 'qa.%' OR email LIKE 'reset.%@example.com'",
  )
  .all();

console.log("test accounts found:", rows.length);
for (const row of rows) {
  console.log(" ", row.email, row.created_at);
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(row.id);
  db.prepare("DELETE FROM password_reset_codes WHERE user_id = ?").run(row.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.id);
  db.prepare("DELETE FROM users WHERE id = ?").run(row.id);
}
console.log("users now:", db.prepare("SELECT COUNT(*) c FROM users").get().c);
console.log(
  "orphan reset codes:",
  db
    .prepare(
      "SELECT COUNT(*) c FROM password_reset_codes WHERE user_id NOT IN (SELECT id FROM users)",
    )
    .get().c,
);
