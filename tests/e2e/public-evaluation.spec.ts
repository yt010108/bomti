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

test("@public-form-happy displays provider and quota before a keyboard-accessible guest submission", async ({ page }) => {
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
  await page.goto("/?fixture=auth");
  await expect(page.getByText("이번 캠페인에서 3회")).toBeVisible();
  await fillRequiredFields(page);
  await consent(page);
  await page.getByRole("button", { name: "평가하기" }).click();
  await expect(page.getByText("인증 평가 결과는 삭제 가능한 이력으로 표시됩니다.")).toBeVisible();
  expect(browserLogs.join("\n")).not.toContain("browser-raw-sentinel@example.com");
});

test("@guest-preview-failures exposes provider, network, and cancel states without fallback", async ({ page }) => {
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

test("@consent-validation-failures keeps submit disabled until all consent and links validation errors", async ({ page }) => {
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
