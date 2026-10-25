import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude Ready App",
  description: "App foundation with Google data and a read-only Claude connector",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
