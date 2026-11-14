"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import ReferenceDashboard from "@/components/ReferenceDashboard";
import { useSession } from "@/components/session";

const PublishedAnalyticsDashboard = dynamic(() => import("@/components/PublishedAnalyticsDashboard"));

export default function DashboardPage() {
  const [view, setView] = useState<"reference" | "published">("reference");
  const { apiKey } = useSession();

  return (
    <div className="space-y-6">
      <nav aria-label="Dashboard views" className="flex flex-wrap gap-2">
        <button className={view === "reference" ? "primary-btn" : "secondary-btn"} aria-pressed={view === "reference"} onClick={() => setView("reference")}>
          WP25 cities &amp; CNAM counts
        </button>
        <button className={view === "published" ? "primary-btn" : "secondary-btn"} aria-pressed={view === "published"} onClick={() => setView("published")}>
          Published territorial analytics
        </button>
      </nav>
      {view === "reference" ? <ReferenceDashboard key={apiKey} /> : <PublishedAnalyticsDashboard key={apiKey} />}
    </div>
  );
}
