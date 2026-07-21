import { expect, test, type Page } from "@playwright/test";

async function fillRequiredFields(page: Page, answer = "문제를 분석하고 팀과 협력해 검증 가능한 결과를 만들었습니다.") {
  await page.getByLabel("자기소개서 질문").fill("지원 직무에서 가장 중요하게 생각하는 역량은 무엇인가요?");
  await page.getByLabel("자기소개서 답변").fill(answer);
  await page.getByLabel("지원 직무").fill("정보보호 담당자");
  await page.getByLabel("회사·공고 맥락").fill("공공 서비스의 개인정보 보호와 사고 대응을 담당하는 역할입니다.");
}

async function consent(page: Page) {
  const all = page.getByRole("checkbox", { name: /모두 동의/ });
  await expect(all).not.toBeChecked();
  await all.check();
  await expect(all).toBeChecked();
}

test("@full-product @public-form-happy @result-a11y-feedback displays provider and quota before a keyboard-accessible guest submission", async ({ page }) => {
  const browserLogs: string[] = [];
  page.on("console", (message) => browserLogs.push(message.text()));
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?scenario=happy");
    await expect(page.getByText("현재 제공자")).toBeVisible();
    await expect(page.getByText("오늘 브라우저당 1회")).toBeVisible();
    await expect(page.getByRole("button", { name: "평가하기" })).toBeDisabled();
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
  }
  await page.goto("/?scenario=happy");
  await fillRequiredFields(page, "browser-raw-sentinel@example.com을 포함한 답변입니다.");
  await consent(page);
  await page.getByRole("button", { name: "평가하기" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("평가 요청을 마쳤습니다")).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
  await expect(page.getByRole("heading", { name: "문장 근거" })).toBeVisible();
  await expect(page.locator(".bomti-dimension")).toHaveCount(5);
  await page.goto("/?fixture=auth");
  await expect(page.getByText("이번 캠페인에서 3회")).toBeVisible();
  await fillRequiredFields(page);
  await consent(page);
  await page.getByRole("button", { name: "평가하기" }).click();
  await expect(page.getByText("인증 평가 결과는 삭제 가능한 이력으로 표시됩니다.")).toBeVisible();
  expect(browserLogs.join("\n")).not.toContain("browser-raw-sentinel@example.com");
});

test("@full-product @result-invalid-segment-xss rejects invalid evidence IDs and keeps provider text inert", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/api/evaluations", async (route) => {
    requestCount += 1;
    const invalidSegment = requestCount === 1;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        audience: "guest",
        verdict: {
          finalIndex: 42,
          dimensions: { contextMismatch: 42, genericityCliche: 42, credibilityRisk: 42, specificityGap: 42, toneReadabilityRisk: 42 },
          explanation: "<script>window.__bomtiXss = true</script>",
          evidence: [{ segmentId: invalidSegment ? "invalid" : "s0001", dimension: "genericityCliche", summary: "<script>window.__bomtiXss = true</script>", severity: 42 }],
          improvements: [{ dimension: "genericityCliche", direction: "Keep this inert", example: "<script>window.__bomtiXss = true</script>" }]
        }
      })
    });
  });

  await page.goto("/?scenario=happy");
  await fillRequiredFields(page);
  await consent(page);
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('form.bomti-panel > [role="alert"]')).toBeVisible();

  await page.goto("/?scenario=happy");
  await fillRequiredFields(page);
  await consent(page);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
  await expect(page.locator("body")).toContainText("<script>window.__bomtiXss = true</script>");
  expect(await page.evaluate(() => (window as Window & { __bomtiXss?: boolean }).__bomtiXss)).toBeUndefined();
});

test("@full-product @guest-preview-failures exposes provider, network, and cancel states without fallback", async ({ page }) => {
  await page.goto("/?scenario=provider-unavailable");
  await fillRequiredFields(page);
  await consent(page);
  await page.getByRole("button", { name: "평가하기" }).click();
  await expect(page.getByText("현재 제공자를 사용할 수 없습니다")).toBeVisible();

  await page.goto("/?scenario=network");
  await fillRequiredFields(page);
  await consent(page);
  await page.getByRole("button", { name: "평가하기" }).click();
  await expect(page.getByText("네트워크 연결을 확인해 주세요")).toBeVisible();

  await page.goto("/?scenario=slow");
  await fillRequiredFields(page);
  await consent(page);
  await page.getByRole("button", { name: "평가하기" }).click();
  await expect(page.getByRole("button", { name: "요청 취소" })).toBeVisible();
  await page.getByRole("button", { name: "요청 취소" }).click();
  await expect(page.getByText("평가 요청을 취소했습니다")).toBeVisible();
});

test("@full-product @consent-validation-failures keeps submit disabled until all consent and links validation errors", async ({ page }) => {
  await page.goto("/?scenario=budget-disabled");
  await expect(page.getByText("평가 예산이 비활성화되었습니다")).toBeVisible();
  await expect(page.getByRole("button", { name: "평가하기" })).toBeDisabled();

  await page.goto("/");
  const all = page.getByRole("checkbox", { name: /모두 동의/ });
  await all.check();
  await expect(page.getByRole("button", { name: "평가하기" })).toBeEnabled();
  await page.getByRole("button", { name: "평가하기" }).click();
  await expect(page.getByText("질문을 입력해 주세요.")).toBeVisible();
  await expect(page.getByLabel("자기소개서 질문")).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("checkbox", { name: /^가명처리 원문/ }).uncheck();
  await expect(all).not.toBeChecked();
  await expect(page.getByRole("button", { name: "평가하기" })).toBeDisabled();
});
