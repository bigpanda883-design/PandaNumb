// Creates a QA admin account directly in the local dev database so the real
// admin API (and therefore the real dashboard) can be exercised in a browser.
// This touches no application code and no production data.
import bcrypt from "bcryptjs";
import { createUser, setUserRole, DATABASE_PATH } from "./server/db.js";

const email = "qa-admin@panda.test";
const password = "PandaQa!2026";
const hash = await bcrypt.hash(password, 12);
let user = null;
try {
  user = createUser({
    name: "QA Admin",
    email,
    phone: "",
    passwordHash: hash,
    role: "admin",
    permissions: {},
  });
  console.log("created", email, "in", DATABASE_PATH);
} catch (error) {
  console.log("create failed:", error.message);
}
if (user) {
  setUserRole({ userId: user.id, role: "admin", permissions: {} });
  console.log("role set to admin");
}
