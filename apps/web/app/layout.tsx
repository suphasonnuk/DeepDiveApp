import type { Metadata, Viewport } from "next";
import "./globals.css";
import { WalletProviders } from "@/lib/wagmi/Providers";

export const metadata: Metadata = {
  title: "DeepDive",
  description: "Personal crypto portfolio management",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0c10",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Source+Sans+3:opsz,wght@8..32,300..700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <WalletProviders>{children}</WalletProviders>
      </body>
    </html>
  );
}
