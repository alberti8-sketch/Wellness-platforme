import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { SessionProvider } from "@/components/session";

export const metadata: Metadata = {
  title: "Wellness Platform",
  description: "Plateforme d'analyse de santé populationnelle et de données comportementales",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
