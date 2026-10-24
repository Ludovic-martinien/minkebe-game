import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Minkébé — Survie dans la forêt équatoriale du Gabon | ONOKO-CRÉATIONS",
  description:
    "Minkébé, jeu de survie 3D dans la forêt équatoriale du Gabon : explore la forêt, bois à la rivière, cueille des fruits, fabrique une lance et construis un abri. Une création ONOKO-CRÉATIONS.",
  authors: [{ name: "ONOKO-CRÉATIONS" }],
  creator: "ONOKO-CRÉATIONS",
  publisher: "ONOKO-CRÉATIONS",
  applicationName: "Minkébé",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Minkébé" },
  other: {
    copyright: `© ${new Date().getFullYear()} ONOKO-CRÉATIONS — Tous droits réservés`,
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#061008",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-[#061008] text-emerald-50 antialiased">{children}</body>
    </html>
  );
}
