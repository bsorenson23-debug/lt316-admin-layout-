import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LT316 Admin",
  description: "LT316 Admin – Laser Bed Layout Workspace",
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
