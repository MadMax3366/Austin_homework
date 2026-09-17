import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teacher workspace · Austin Education",
  description: "Attendance, class notes, and auditable lesson-credit management.",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
