import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";

const sans = Inter({
  subsets: ["cyrillic", "latin"],
  variable: "--font-inter",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "PetCare",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${sans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}