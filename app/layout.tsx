import type { Metadata } from "next";
import "./globals.css";
import { IBM_Plex_Mono, Newsreader, Public_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";

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
  title: "MyFin",
  description: "Personal finance tracker",
  icons: {
    icon: "/favicon.svg",
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
      className={cn(
        "font-sans",
        publicSans.variable,
        newsreader.variable,
        ibmPlexMono.variable
      )}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
