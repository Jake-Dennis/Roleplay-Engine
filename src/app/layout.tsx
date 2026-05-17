import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roleplay Engine",
  description: "Persistent narrative roleplay engine",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
