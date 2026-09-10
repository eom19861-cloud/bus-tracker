import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_KR } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = IBM_Plex_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "경기버스 도착",
  description: "경기도 버스 정류소 검색과 실시간 도착정보",
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${sans.className} antialiased`}>
        <div className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-10 pt-5">
          <header className="mb-6 flex items-end justify-between">
            <Link href="/" className="block">
              <p className="text-[11px] font-medium tracking-[0.22em] text-[#ffb703]">GYEONGGI BUS</p>
              <h1 className="text-2xl font-semibold tracking-tight">도착 전광판</h1>
            </Link>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-[#93a1b1]">실시간</span>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
