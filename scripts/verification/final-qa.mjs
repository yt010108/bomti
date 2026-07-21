import { execFile, spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const productDependencies = ["app/api/evaluations/route.ts", "app/history/page.tsx", "tests/e2e"];

async function dependenciesReady() {
  const results = await Promise.allSettled(
    productDependencies.map((dependency) => access(path.join(process.cwd(), dependency)))
  );
  return results.every((result) => result.status === "fulfilled");
}

function configurationEnabled(flags) {
  return (
    flags.enabled === "true" ||
    (flags.supabase === "isolated" && flags.providers === "deterministic" && flags.auth === "fixtures")
  );
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error("FINAL_QA_PORT_UNAVAILABLE");
  return port;
}

function npmCommand(args) {
  if (process.platform !== "win32") return ["npm", args];
  const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  return [process.execPath, [npmCli, ...args]];
}

function startCommand(port) {
  if (process.platform !== "win32") {
    return npmCommand(["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(port)]);
  }
  return [process.execPath, [
    path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port)
  ]];
}

async function runNpm(args, environment = process.env) {
  const [executable, commandArgs] = npmCommand(args);
  await execFileAsync(executable, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: environment,
    maxBuffer: 10 * 1024 * 1024
  });
}

async function pollReadiness(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok && (await response.json()).status === "ok") return;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("FINAL_QA_READINESS_TIMEOUT");
}

async function stopService(service) {
  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill", ["/PID", String(service.pid), "/T", "/F"], { windowsHide: true });
    } catch (error) {
      if (!(error instanceof Error) || !/not found|no running instance/i.test(error.stderr ?? error.message)) throw error;
    }
    return;
  }
  if (service.exitCode !== null) return;
  const exited = new Promise((resolve) => service.once("exit", resolve));
  service.kill("SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (service.exitCode === null) {
    service.kill("SIGKILL");
    await exited;
  }
}

export async function runFinalQa(flags) {
  if (!configurationEnabled(flags) || !(await dependenciesReady())) {
    return {
      verdict: "blocked",
      code: "dependency_not_ready",
      scope: "final QA product dependency",
      assertions: ["final QA dependencies checked", "no unavailable behavior reported as pass"]
    };
  }

  const port = await availablePort();
  const workspace = await mkdtemp(path.join(os.tmpdir(), "bomti-final-qa-"));
  const artifactRoot = path.resolve(flags.out);
  const baseUrl = `http://127.0.0.1:${port}`;
  const environment = {
    ...process.env,
    BOMTI_BASE_URL: baseUrl,
    BOMTI_TEST_SUPABASE_NAMESPACE: `bomti_${flags.sha.slice(0, 8)}_${port}`,
    BOMTI_QA_VIEWPORTS: typeof flags.viewports === "string" ? flags.viewports : "375,768,1280",
    BOMTI_QA_STATES: typeof flags.states === "string" ? flags.states : "",
    BOMTI_API_TEST_MODE: "true",
    NO_UPDATE_NOTIFIER: "1"
  };
  let service = null;
  let failure = false;
  try {
    await runNpm([
      "run",
      "test:db",
      "--",
      "--profile=migration-reset-types",
      `--out=${path.join(artifactRoot, "database")}`,
      `--sha=${flags.sha}`
    ], environment);
    await runNpm(["run", "build"], environment);
    const [executable, commandArgs] = startCommand(port);
    service = spawn(executable, commandArgs, {
      cwd: process.cwd(),
      env: environment,
      stdio: "ignore"
    });
    await pollReadiness(`${baseUrl}/api/health`);
    await runNpm(
      ["exec", "playwright", "test", "--", "--project=chromium", "--grep=@full-product", `--output=${path.join(artifactRoot, "browser")}`],
      environment
    );
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    failure = true;
  } finally {
    try {
      if (service) await stopService(service);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      failure = true;
    }
    try {
      await rm(workspace, { recursive: true, force: true });
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      failure = true;
    }
  }

  if (failure) {
    return {
      verdict: "fail",
      code: "final_qa_failed",
      scope: "provision reset build start readiness browser accessibility cleanup",
      assertions: ["service process trap-cleaned", "failed final QA cannot approve"],
      exitCode: 1
    };
  }
  return {
    verdict: "approve",
    scope: "provision reset build start readiness browser accessibility cleanup",
    assertions: [
      "isolated database reset completed",
      "production build and service readiness completed",
      "browser accessibility scenarios completed",
      "service process trap-cleaned"
    ]
  };
}
