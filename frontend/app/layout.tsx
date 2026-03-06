import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ROBOTWIN — Predictive Maintenance Dashboard",
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
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
