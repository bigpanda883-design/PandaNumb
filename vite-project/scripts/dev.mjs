/**
 * Dev launcher: starts the API server and the Vite dev server together.
 *
 * `npm run dev` runs this, so the proxy backend is always up when the frontend
 * is. The two can also be run separately:
 *   npm run dev:server   -> Express proxy on :8787
 *   npm run dev:client   -> Vite on :5173
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ENV_FILE = ".env.server";

/**
 * Read a key straight from .env.server without loading it into this process.
 * Returns "" when the file is missing or the key is unset/blank.
 */
function readEnvValue(file, name) {
  let text;
  try {
    text = fs.readFileSync(path.resolve(import.meta.dirname, "..", file), "utf8");
  } catch {
    return "";
  }
  const match = new RegExp(`^\\s*${name}\\s*=(.*)$`, "m").exec(text);
  return match ? match[1].trim() : "";
}

// Check before spawning anything: a missing key makes the server look healthy
// while every /api/sms request answers 503. Warning here means the very first
// thing on screen explains the "temporarily unavailable" message.
const apiKey =
  readEnvValue(ENV_FILE, "YANKEE_API_KEY") ||
  readEnvValue(ENV_FILE, "YANKEE_VERIFY_API_KEY");

if (!apiKey) {
  console.warn(
    "[dev] ------------------------------------------------------------\n" +
      `[dev] WARNING: no Yankee Verify API key found in ${ENV_FILE}.\n` +
      "[dev] Number purchases and SMS verification will fail with\n" +
      "[dev] \"Number purchases are temporarily unavailable\".\n" +
      "[dev] That message means the key is MISSING, not that the provider is down.\n" +
      `[dev] Paste your key into ${ENV_FILE} (YANKEE_API_KEY=...) and restart.\n` +
      "[dev] ------------------------------------------------------------",
  );
}

const processes = [];

/**
 * The dev servers are run ONCE together. A second `npm run dev` while the first
 * is still up used to fail with "Port 5173 is already in use" - and, worse, to
 * leave its own freshly spawned API server running (see `shutdown` below).
 */
function run(name, command, args) {
  // No shell on Windows: the Vite CLI is launched through `node` itself, so the
  // process tree stays in one place (killing a shell wrapper orphaned the
  // servers it had started) and no untrusted argument is ever re-parsed.
  // Windows refuses to spawn a `.cmd` without a shell (spawn EINVAL, Node 20+),
  // which is why `npx.cmd` is not used here.
  const child = spawn(command, args, { stdio: "inherit" });

  child.on("error", (error) => {
    console.error(`[dev] could not start ${name}: ${error.message}`);
    shutdown(1);
  });

  child.on("exit", (code) => {
    // If either process dies, take the other down with it rather than leaving
    // a half-running stack.
    if (code !== 0 && code !== null) {
      console.error(`[dev] ${name} exited with code ${code}`);
    }
    shutdown(code ?? 0);
  });

  processes.push(child);
  return child;
}

/**
 * Kill every child and END THE PROCESS.
 *
 * The old version killed them and called process.exit(0) itself, but the child
 * `exit` handler could fire re-entrantly and the servers kept listening. Code is
 * propagated so a failing stack exits non-zero.
 */
function stopAll(code) {
  processes.forEach((child) => {
    if (!child.killed && child.exitCode === null) child.kill();
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopAll(0);
    process.exit(0);
  });
}

// A hard stop on the way out: anything still listening would hold the port for
// the next `npm run dev`.
process.on("exit", stopAll);

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopAll(code);
  // Give the children a moment to close their listeners, then leave with the
  // real status instead of a misleading 0.
  setTimeout(() => process.exit(code), 300);
}

// Run Vite's CLI script with this same Node binary instead of the `vite`/`npx`
// `.cmd` shims, which cannot be spawned without a shell on Windows.
const VITE_BIN = path.join(import.meta.dirname, "..", "node_modules", "vite", "bin", "vite.js");

// Server first, so the proxy is listening before the client requests it.
run("server", process.execPath, [`--env-file=${ENV_FILE}`, "server/index.js"]);
run("client", process.execPath, [VITE_BIN]);
