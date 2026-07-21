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
            <a className="bomti-brand" href="/" aria-label="Bomti 홈">Bomti</a>
            <nav className="bomti-site-nav" aria-label="주요 메뉴">
              <a href="/diagnosis">진단하기</a>
              <a href="/history">내 기록</a>
            </nav>
            <a className="bomti-site-header__cta" href="/account">계정 설정</a>
          </div>
        </header>
        {children}
        <footer className="bomti-site-footer">
          <div className="bomti-site-footer__inner">
            <div className="bomti-site-footer__brand"><strong>Bomti</strong><span>Bomti index는 합격·불합격 판정이 아닙니다.</span></div>
            <nav aria-label="서비스"><a href="/diagnosis">평가와 개인정보 안내</a><a href="/history">내 기록</a><a href="/account">계정 설정</a></nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
