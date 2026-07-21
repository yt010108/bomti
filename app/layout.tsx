import type { Metadata } from "next";
import { DevClientInstrumentation } from "./dev-client-instrumentation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bomti",
  description: "자기소개서 답변의 상투성과 맥락 위험을 점검하는 한국어 평가 도구"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body data-bomti-fixture={process.env.BOMTI_API_TEST_MODE === "true" ? "true" : "false"}>
        {process.env.NODE_ENV === "development" ? <DevClientInstrumentation /> : null}
        <header className="bomti-site-header">
          <div className="bomti-site-header__inner">
            <a className="bomti-brand" href="/" aria-label="Bomti 홈">
              <span className="bomti-brand__mark" aria-hidden="true">b</span>
              <span>Bomti</span>
            </a>
            <nav className="bomti-site-nav" aria-label="주요 메뉴">
              <a href="/#evaluation-form">답변 진단</a>
              <a href="/history">내 이력</a>
              <a href="/account">계정</a>
            </nav>
            <a className="bomti-site-header__cta" href="/#evaluation-form">무료로 시작하기</a>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
