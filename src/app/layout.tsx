import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ethereal Library | Yacht Crew Mental Health & Therapy",
  description:
    "Professional psychology and therapy services designed for yacht crew members. 24/7 crisis support, guided meditation, and specialized maritime mental health care.",
  keywords: [
    "yacht crew mental health",
    "maritime therapy",
    "seafarer counseling",
    "yachting wellness",
    "crew support",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-950">{children}</body>
    </html>
  );
}
