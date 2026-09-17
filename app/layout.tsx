import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "学生运营系统 · Austin Education",
  description: "招生、排课、教学、课时、续费与运营管理。",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
        <footer className="border-t border-border bg-white px-5 py-3 text-center text-xs text-muted-foreground">© 2026 Austin Education</footer>
      </body>
    </html>
  );
}
