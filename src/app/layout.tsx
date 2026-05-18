import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const openDyslexic = localFont({
  src: [
    { path: "../../public/fonts/OpenDyslexic-Regular.otf", weight: "400", style: "normal" },
    { path: "../../public/fonts/OpenDyslexic-Italic.otf", weight: "400", style: "italic" },
    { path: "../../public/fonts/OpenDyslexic-Bold.otf", weight: "700", style: "normal" },
    { path: "../../public/fonts/OpenDyslexic-BoldItalic.otf", weight: "700", style: "italic" },
  ],
  variable: "--font-open-dyslexic",
});

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
    <html lang="en" className={`h-full ${openDyslexic.variable}`}>
      <body className="h-full antialiased font-sans">{children}</body>
    </html>
  );
}
