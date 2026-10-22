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

function run(name, command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code) => {
    // If either process dies, take the other down with it rather than leaving
    // a half-running stack.
    if (code !== 0 && code !== null) {
      console.error(`[dev] ${name} exited with code ${code}`);
    }
    shutdown();
  });

  processes.push(child);
  return child;
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  processes.forEach((child) => {
    if (!child.killed) child.kill();
  });
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Server first, so the proxy is listening before the client requests it.
run("server", "node", [`--env-file=${ENV_FILE}`, "server/index.js"]);
run("client", "npx", ["vite"]);
