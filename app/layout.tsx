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
      <body>
        {process.env.NODE_ENV === "development" ? <DevClientInstrumentation /> : null}
        {children}
      </body>
    </html>
  );
}
