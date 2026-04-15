import type { Metadata } from "next";
import { Geist, Geist_Mono, Jersey_25 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jersey25 = Jersey_25({
  variable: "--font-jersey",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bazaar Validator",
  description:
    "Verify whether your x402 endpoint is indexed in the Bazaar, diagnose issues, and get guided setup.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${jersey25.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
