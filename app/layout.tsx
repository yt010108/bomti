import type { Metadata } from "next";
import { DevClientInstrumentation } from "./dev-client-instrumentation";

export const metadata: Metadata = {
  title: "Bomti",
  description: "Korean work-agent evaluation and preference dataset platform"
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
