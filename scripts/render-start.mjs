import { spawn } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const service = process.argv[2];

async function run(args) {
  const code = await spawnAndWait(args);
  if (code !== 0) {
    process.exit(code ?? 1);
  }
}

function spawnAndWait(args) {
  return new Promise((resolve) => {
    const child = spawn(pnpm, args, {
      env: process.env,
      shell: false,
      stdio: "inherit"
    });
    child.on("close", resolve);
    child.on("error", (error) => {
      console.error(error);
      resolve(1);
    });
  });
}

function start(args) {
  const child = spawn(pnpm, args, {
    env: process.env,
    shell: false,
    stdio: "inherit"
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }

  child.on("close", (code) => {
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error(error);
    process.exit(1);
  });
}

switch (service) {
  case "api":
    await run(["--filter", "@personal-context-os/db", "migrate"]);
    start(["--filter", "@personal-context-os/api", "start"]);
    break;
  case "mcp":
    start(["--filter", "@personal-context-os/mcp-server", "start"]);
    break;
  case "web":
    start([
      "--filter",
      "@personal-context-os/web",
      "exec",
      "next",
      "start",
      "-H",
      "0.0.0.0",
      "-p",
      process.env.PORT || "10000"
    ]);
    break;
  case "worker":
    start(["--filter", "@personal-context-os/worker", "start"]);
    break;
  default:
    console.error(`Unknown Render service: ${service || "(missing)"}`);
    process.exit(1);
}
