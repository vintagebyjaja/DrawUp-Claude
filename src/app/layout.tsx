import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DrawUp Season 1",
  description: "The built world, drawn together.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/drawup-icon-512.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
