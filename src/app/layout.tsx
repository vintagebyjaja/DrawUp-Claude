import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DrawUp Season 1",
  description: "Draw it up. See it through.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/drawup-icon-512.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
