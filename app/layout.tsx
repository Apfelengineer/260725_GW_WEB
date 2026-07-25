import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0c2138",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const origin = `${protocol}://${host}`;

  return {
    title: "KPTC Scheduler｜チームの予定と行き先をひと目で",
    description: "予定共有、在席・行き先、伝言メモをひとつにまとめた KPTC Scheduler のWEBブラウザ版です。",
    applicationName: "KPTC Scheduler",
    openGraph: {
      title: "KPTC Scheduler",
      description: "チームの今を、ひと目で。予定・行き先・伝言をまとめて共有。",
      type: "website",
      locale: "ja_JP",
      images: [{ url: new URL("/og.png", origin).toString(), width: 1200, height: 630, alt: "KPTC Scheduler WEBブラウザ版" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "KPTC Scheduler",
      description: "チームの今を、ひと目で。",
      images: [new URL("/og.png", origin).toString()],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
