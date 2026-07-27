import type { Metadata, Viewport } from "next";
import { Inter, Lexend, DM_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { NavShell } from "@/components/NavShell";

const lexend = Lexend({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-body",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Prefect Hub — St. Margaret's",
    template: "%s · Prefect Hub",
  },
  description:
    "Handbook, simulations and duty portal for the Prefect Board of St. Margaret's Co-educational English Secondary and Primary School.",
};

export const viewport: Viewport = {
  themeColor: "#0b3374",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${lexend.variable} ${inter.variable} ${dmMono.variable}`}
    >
      <body className="font-body">
        <AuthProvider>
          <NavShell>{children}</NavShell>
        </AuthProvider>
      </body>
    </html>
  );
}
