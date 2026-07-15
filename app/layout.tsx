import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bomti",
  description: "Korean work-agent evaluation and preference dataset platform"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
