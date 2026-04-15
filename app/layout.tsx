import type { Metadata } from "next";
import { Geist, Geist_Mono, Jersey_25 } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: { url: "/apple-touch-icon.png" },
    other: [
      { rel: "manifest", url: "/site.webmanifest" },
      {
        rel: "icon",
        url: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        rel: "icon",
        url: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  },
  openGraph: {
    title: "Bazaar Validator",
    description:
      "Verify whether your x402 endpoint is indexed in the Bazaar, diagnose issues, and get guided setup.",
    images: [{ url: "https://bazaar-validate.vercel.app/og.png" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bazaar Validator",
    description:
      "Verify whether your x402 endpoint is indexed in the Bazaar, diagnose issues, and get guided setup.",
    images: ["https://bazaar-validate.vercel.app/og.png"],
  },
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
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
