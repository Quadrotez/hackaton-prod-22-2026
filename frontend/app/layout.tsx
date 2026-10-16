import type { Metadata } from "next";
import "./globals.css";
import { Ledger, Inter } from "next/font/google";

const heading = Ledger({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: "400",
});

const sans = Inter({
  subsets: ["cyrillic", "latin"],
  variable: "--font-sans",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "PetCare",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${heading.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
