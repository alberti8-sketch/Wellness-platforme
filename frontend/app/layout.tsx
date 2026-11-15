import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { AnalyticsProvider } from "@/components/analytics";
import { AppShell } from "@/components/app-shell";
import { SessionProvider } from "@/components/session";

export const metadata: Metadata = {
  title: "Wellness - Santé populationnelle",
  description: "Plateforme d'analyse de santé populationnelle et de données comportementales",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Radio+Canada+Big:wght@400..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        <SessionProvider>
          <AnalyticsProvider>
            <AppShell>{children}</AppShell>
          </AnalyticsProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
