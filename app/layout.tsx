import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Student operations system · Austin Education",
  description:
    "Role-scoped admissions, scheduling, teaching, lesson-credit, finance, payroll, and platform operations.",
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
    <html lang="en-AU">
      <body className="antialiased">
        {children}
        <footer className="border-t border-border bg-white px-5 py-3 text-center text-xs text-muted-foreground">
          © 2026 Junfeng Yan · GitHub: MadMax3366 · Proprietary evaluation artifact · Not open source · AUS-HOMEWORK-MADMAX3366-2026-09
        </footer>
      </body>
    </html>
  );
}
