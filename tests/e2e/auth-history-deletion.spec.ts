import { expect, test, type APIResponse, type BrowserContext, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

let sequence = 0;

function user(prefix: string) {
  sequence += 1;
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}

function cookieValue(header: string | undefined, name: string) {
  const value = new RegExp(`${name}=([^;]+)`).exec(header ?? "")?.[1];
  if (!value) throw new Error(`COOKIE_MISSING:${name}`);
  return value;
}

function responseCookie(response: APIResponse, name: string) {
  const setCookie = response.headers()["set-cookie"] ?? response.headersArray().filter((header) => header.name.toLowerCase() === "set-cookie").map((header) => header.value).join("; ");
  return cookieValue(setCookie, name);
}

async function installSession(page: Page, context: BrowserContext, fixtureUser: string) {
  const origin = new URL(page.url() || "http://127.0.0.1:3000").origin;
  const started = await page.request.get(`${origin}/api/auth/sign-in?returnTo=/history`);
  const authorization = await started.json() as { authorizeUrl: string };
  const state = new URL(authorization.authorizeUrl).searchParams.get("state");
  const callback = await page.request.get(`${origin}/auth/callback?code=fixture-code&state=${state}`, {
    maxRedirects: 0,
    headers: { cookie: `bomti_pkce=${responseCookie(started, "bomti_pkce")}`, "x-bomti-test-user": fixtureUser, origin }
  });
  const session = responseCookie(callback, "bomti_session");
  await context.addCookies([{ name: "bomti_session", value: session, url: origin }]);
  return `bomti_session=${session}`;
}

test("@full-product @auth-history-delete-happy shows owned history, confirms individual deletion, and completes account deletion", async ({ page, context }) => {
  await page.goto("/");
  await installSession(page, context, user("e2e-history"));
  const evaluationId = "11111111-1111-4111-8111-111111111111";
  let deleted = false;
  await page.route((url) => url.pathname === "/api/evaluations" && url.searchParams.get("limit") === "20", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ evaluations: deleted ? [] : [{ id: evaluationId, createdAt: "2026-07-21T00:00:00.000Z", verdict: { finalIndex: 42, descriptor: "fixture" } }], nextCursor: null })
  }));
  await page.route("**/api/usage", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ allowance: 3, consumed: 1, remaining: 2 }) }));
  await page.route(`**/api/evaluations/${evaluationId}`, (route) => { deleted = true; return route.fulfill({ status: 204 }); });
  await page.route("**/api/account", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ terminal: "account_deleted", state: "complete" }) }));

  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "내 기록" })).toBeVisible();
  await expect(page.locator(".bomti-history-list a")).toHaveCount(1);
  page.on("dialog", (dialog) => dialog.accept());
  const deletionResponse = page.waitForResponse((response) => response.request().method() === "DELETE" && response.url().includes("/api/evaluations/"));
  await page.getByRole("button", { name: "기록 삭제" }).click();
  expect((await deletionResponse).status()).toBe(204);
  await expect(page.getByText("저장된 진단 기록이 아직 없습니다.")).toBeVisible();

  await page.goto("/account");
  await page.getByRole("checkbox").check();
  const accountResponse = page.waitForResponse((response) => response.request().method() === "DELETE" && response.url().endsWith("/api/account"));
  await page.getByRole("button", { name: "계정 영구 삭제" }).click();
  expect((await accountResponse).status()).toBe(200);
  await expect(page.getByText("계정 삭제 요청을 완료했습니다.")).toBeVisible();
});

test("@full-product @auth-deletion-saga-security-failures rejects stale sessions immediately after a failure-injected deletion transition", async ({ page, context }) => {
  await page.goto("/");
  const session = await installSession(page, context, user("e2e-deletion"));
  await context.clearCookies();
  const origin = new URL(page.url()).origin;
  const deletion = await page.request.delete(`${origin}/api/account`, {
    headers: { origin, cookie: session, "x-bomti-test-delete-failure": "sessions_revoked" }
  });
  expect(deletion.status()).toBe(503);
  expect(await deletion.json()).toEqual({ error: { code: "DELETION_RETRY_REQUIRED" } });
  const stale = await page.request.get(`${origin}/api/evaluations`, { headers: { cookie: session } });
  expect(stale.status()).toBe(401);
  expect(await stale.json()).toEqual({ error: { code: "SESSION_REVOKED" } });
  await page.route((url) => url.pathname === "/api/evaluations" && url.searchParams.get("limit") === "20", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "SESSION_REVOKED" } })
  }));
  await page.goto("/history");
  await expect(page.getByText("진단 기록을 불러오지 못했습니다.")).toBeVisible();
});
