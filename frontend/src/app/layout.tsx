import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StormPulse — Tornado Response Map",
  description: "Open-source tornado damage mapping. NOAA/NWS data fusion for emergency responders.",
  keywords: ["tornado", "emergency", "NOAA", "NWS", "damage", "response", "map"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-900 text-white">{children}</body>
    </html>
  );
}
