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
  themeColor: "#0a0a0f",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WalletProviders>{children}</WalletProviders>
      </body>
    </html>
  );
}
