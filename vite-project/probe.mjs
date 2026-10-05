/**
 * Temporary probe: exercises the dev server through the Vite proxy exactly as
 * a browser would, and writes results to a file (this shell cannot capture
 * piped stdout).
 */
import { writeFileSync } from "node:fs";

const ORIGIN = "http://127.0.0.1:5173";
const lines = [];

async function probe(label, path, init) {
  try {
    const res = await fetch(`${ORIGIN}${path}`, init);
    const text = await res.text();
    lines.push(
      `${label}\n  status: ${res.status}\n  type: ${res.headers.get("content-type")}\n  body: ${text.slice(0, 220)}\n`,
    );
  } catch (error) {
    lines.push(`${label}\n  ERROR: ${error?.message || error}\n`);
  }
}

const RUN = `${Date.now()}`;
const password = "StrongPass1!";

await probe("GET / (page loads)", "/");

await probe("POST /api/auth/login (wrong creds)", "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "nobody@example.com", password }),
});

await probe("POST /api/auth/register (new user)", "/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    fullName: "Proxy Probe",
    email: `probe${RUN}@example.com`,
    phone: `+2348${String(Date.now()).slice(-9)}`,
    password,
  }),
});

await probe("POST /api/auth/login (correct creds)", "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `probe${RUN}@example.com`, password }),
});

writeFileSync("probe-out.txt", lines.join("\n"), "utf8");
