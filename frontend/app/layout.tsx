import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { ActivePetProvider } from "@/components/active-pet-provider";
import { Toaster } from "@/components/ui/sonner";
import { themeInitScript } from "@/lib/theme";

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
    <html lang="ru" suppressHydrationWarning className={`${sans.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <ActivePetProvider>
          {children}
          <Toaster position="top-center" />
        </ActivePetProvider>
      </body>
    </html>
  );
}