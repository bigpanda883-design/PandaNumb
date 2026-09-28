/**
 * Dev launcher: starts the API server and the Vite dev server together.
 *
 * `npm run dev` runs this, so the proxy backend is always up when the frontend
 * is. The two can also be run separately:
 *   npm run dev:server   -> Express proxy on :8787
 *   npm run dev:client   -> Vite on :5173
 */
import { spawn } from "node:child_process";

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
run("server", "node", ["--env-file=.env.server", "server/index.js"]);
run("client", "npx", ["vite"]);
