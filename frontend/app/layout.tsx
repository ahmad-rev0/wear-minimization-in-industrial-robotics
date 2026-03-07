import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ROBOFIX — Predictive Maintenance Dashboard",
  description:
    "AI-powered predictive maintenance and wear optimization for industrial robots",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
