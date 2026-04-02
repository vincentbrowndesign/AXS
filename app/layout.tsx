import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Axis",
  description: "Measurement over opinion.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}