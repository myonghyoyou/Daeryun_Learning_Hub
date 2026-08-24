import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";

// 정답지 G1: 문서 제목은 "문제 은행 Hub" (index.html 실측값)
export const metadata: Metadata = { title: "문제 은행 Hub" };

// 정답지 G3: viewport 메타가 빠지면 모바일에서 640px 게이트가 무력화된다.
// Next 는 이 export 로 <meta name="viewport"> 를 만든다.
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
