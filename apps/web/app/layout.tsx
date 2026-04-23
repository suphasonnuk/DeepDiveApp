import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Source_Sans_3, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProviders } from "@/lib/wagmi/Providers";

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-display",
  display: "swap",
});

const sourceSans3 = Source_Sans_3({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DeepDive",
  description: "Personal crypto portfolio management",
  // iOS: launches in full-screen when added to home screen, hides Safari chrome
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DeepDive",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0c10",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${barlowCondensed.variable} ${sourceSans3.variable} ${jetbrainsMono.variable}`}>
      <body>
        <WalletProviders>{children}</WalletProviders>
      </body>
    </html>
  );
}
