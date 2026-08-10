import type { Metadata, Viewport } from "next";
import "./globals.css";
import { IBM_Plex_Mono, Newsreader, Public_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  style: ["normal", "italic"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "MyFin — Personal Finance Tracker",
    template: "%s · MyFin",
  },
  description:
    "Track income and spending across accounts, holdings, and net worth — all in one place.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MyFin",
  },
  icons: {
    icon: [
      { url: "/favicon.svg" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#083458",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "font-sans",
        publicSans.variable,
        newsreader.variable,
        ibmPlexMono.variable
      )}
    >
      <body>
        <Providers>{children}</Providers>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
