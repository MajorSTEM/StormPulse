import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StormPulse — Severe Weather Map",
  description: "Real-time severe weather damage mapping. NWS alerts, storm reports, and inferred impact corridors.",
  keywords: ["tornado", "emergency", "NOAA", "NWS", "damage", "response", "map", "severe weather"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
