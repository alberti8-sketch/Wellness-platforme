"use client";

import ReferenceDashboard from "@/components/ReferenceDashboard";
import { useSession } from "@/components/session";

/** CNAM department counts + WP25 reference cities (vue de l'équipe, conservée telle quelle). */
export default function SantePage() {
  const { apiKey } = useSession();
  return <ReferenceDashboard key={apiKey} />;
}
