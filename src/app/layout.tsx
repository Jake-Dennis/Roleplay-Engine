import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roleplay Engine",
  description: "Persistent Narrative Roleplay Engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-surface text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
