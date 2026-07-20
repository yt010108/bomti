import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { AxeBuilder } from "@axe-core/playwright";
import { chromium } from "@playwright/test";
import { parseFlags, requireReceiptFlags, writeReceipt } from "../evidence/receipt.mjs";

const allowedProfiles = new Set(["primitive-showcase", "fixture-color-only-meter"]);

function parseViewportList(value) {
  const widths = String(value ?? "375,768,1280").split(",").map(Number);
  if (widths.some((width) => !Number.isInteger(width) || width < 320 || width > 2560)) {
    throw new Error("VIEWPORTS_INVALID");
  }
  return widths;
}

function parseStateList(value) {
  return String(value ?? "default").split(",").map((state) => state.trim()).filter(Boolean);
}

async function isReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilReady(url, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isReady(url)) return;
    if (child.exitCode !== null) throw new Error(`DEV_SERVICE_EXITED:${child.exitCode}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("DEV_SERVICE_READINESS_TIMEOUT");
}

async function ensureService(flags, targetUrl) {
  if (await isReady(targetUrl)) return null;
  if (flags.service !== "dev") throw new Error("VISUAL_SERVICE_UNAVAILABLE");

  const parsed = new URL(targetUrl);
  const port = parsed.port || "3000";
  const child = spawn("npm", ["run", "dev", "--", "--hostname", parsed.hostname, "--port", port], {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "ignore"
  });
  await waitUntilReady(targetUrl, child);
  return child;
}

async function stopService(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
  else child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000))
  ]);
}

function urlForState(baseUrl, profile, state) {
  const url = new URL(baseUrl);
  if (profile === "fixture-color-only-meter") url.searchParams.set("fixture", "color-only-meter");
  else if (state !== "default") url.searchParams.set("state", state);
  return url.toString();
}

async function auditPage(page) {
  const axe = await new AxeBuilder({ page }).analyze();
  const serious = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
  const layout = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    overflow: document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth
  }));
  const computedStyles = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const button = document.querySelector(".bomti-button");
    const buttonStyle = button ? getComputedStyle(button) : null;
    return {
      paper: root.getPropertyValue("--paper").trim(),
      ink: root.getPropertyValue("--ink").trim(),
      accent: root.getPropertyValue("--accent").trim(),
      fontFamily: root.fontFamily,
      lineHeight: root.lineHeight,
      buttonMinHeight: buttonStyle?.minHeight ?? null,
      buttonBorderRadius: buttonStyle?.borderRadius ?? null
    };
  });
  const meters = await page.locator('[role="progressbar"]').evaluateAll((elements) => elements.map((element) => ({
    nameReference: element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("title"),
    min: element.getAttribute("aria-valuemin"),
    max: element.getAttribute("aria-valuemax"),
    now: element.getAttribute("aria-valuenow"),
    text: element.textContent?.trim() ?? ""
  })));
  return { axe, serious, layout, computedStyles, meters };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireReceiptFlags(flags, ["profile", "out", "sha", "url"]);
  if (!allowedProfiles.has(flags.profile)) throw new Error(`UNKNOWN_VISUAL_PROFILE:${flags.profile}`);

  const widths = parseViewportList(flags.viewports);
  const states = parseStateList(flags.states);
  const outputDirectory = path.resolve(flags.out);
  await mkdir(outputDirectory, { recursive: true });

  let service;
  let browser;
  const findings = [];
  try {
    service = await ensureService(flags, flags.url);
    browser = await chromium.launch({ headless: true });
    for (const width of widths) {
      for (const state of states) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          reducedMotion: state === "reduced-motion" ? "reduce" : "no-preference",
          colorScheme: "light"
        });
        const page = await context.newPage();
        await page.goto(urlForState(flags.url, flags.profile, state), { waitUntil: "networkidle" });
        if (state === "focus") await page.getByRole("button", { name: "평가하기" }).first().focus();
        const audit = await auditPage(page);
        await page.screenshot({ path: path.join(outputDirectory, `${flags.profile}-${width}-${state}.png`), fullPage: true });
        findings.push({
          width,
          state,
          url: new URL(page.url()).pathname,
          layout: audit.layout,
          computedStyles: audit.computedStyles,
          meters: audit.meters,
          axeViolations: audit.axe.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length })),
          seriousOrCritical: audit.serious.map(({ id, impact }) => ({ id, impact }))
        });
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await stopService(service);
  }

  await writeFile(path.join(outputDirectory, "visual-findings.json"), `${JSON.stringify(findings, null, 2)}\n`, "utf8");
  const overflow = findings.some((finding) => finding.layout.overflow);
  const serious = findings.flatMap((finding) => finding.seriousOrCritical);
  const unnamedMeter = findings.some((finding) => finding.meters.some((meter) => !meter.nameReference && !meter.text));
  const incompleteMeter = findings.some((finding) => finding.meters.some((meter) => meter.min !== "0" || meter.max !== "100" || meter.now === null));

  if (flags.profile === "fixture-color-only-meter") {
    const detected = unnamedMeter || serious.some((finding) => finding.id === "aria-progressbar-name");
    await writeReceipt(outputDirectory, {
      verdict: detected ? "fail" : "pass",
      code: detected ? "METER_ACCESSIBLE_NAME_MISSING" : "NEGATIVE_FIXTURE_NOT_DETECTED",
      runner: "visual",
      profile: flags.profile,
      sha: flags.sha,
      assertions: ["color-only meter fixture rendered", "accessible name requirement evaluated"],
      screenshots: findings.length
    });
    process.exitCode = detected ? 1 : 2;
    return;
  }

  const failures = [];
  if (overflow) failures.push("LAYOUT_HORIZONTAL_OVERFLOW");
  if (serious.length) failures.push("AXE_SERIOUS_OR_CRITICAL");
  if (unnamedMeter) failures.push("METER_ACCESSIBLE_NAME_MISSING");
  if (incompleteMeter) failures.push("METER_SEMANTICS_INCOMPLETE");
  await writeReceipt(outputDirectory, {
    verdict: failures.length ? "fail" : "pass",
    code: failures[0],
    runner: "visual",
    profile: flags.profile,
    sha: flags.sha,
    assertions: [
      "375/768/1280 viewport evidence captured",
      "zero serious or critical accessibility violations",
      "no horizontal clipping",
      "meter exposes name, min, max, and current value",
      "screenshots contain synthetic fixture text only"
    ],
    viewports: widths,
    states,
    screenshots: findings.length,
    failureCodes: failures
  });
  if (failures.length) process.exitCode = 1;
}

main().catch(async (error) => {
  const flags = parseFlags(process.argv.slice(2));
  if (typeof flags.out === "string") {
    await writeReceipt(flags.out, {
      verdict: "fail",
      code: error.message,
      runner: "visual",
      profile: flags.profile,
      sha: flags.sha,
      assertions: ["visual runner failed closed"]
    });
  }
  console.error(error.message);
  process.exitCode = 1;
});
