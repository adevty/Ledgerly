import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEDGERLY — Onchain Financial Rails for Real Businesses",
  description:
    "Confidential, audit-ready merchant payments, invoicing, and cross-border stablecoin remittances on NEAR Protocol.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
