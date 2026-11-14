"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { STEPS } from "@/lib/steps";

/** Bottom-of-page guide to the next step of the journey. */
export function NextStep({ step }: { step: number }) {
  const last = step >= STEPS.length - 1;
  const next = last ? STEPS[0] : STEPS[step + 1];
  return (
    <div className="no-print mt-8 flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-white px-5 py-4">
      <p className="text-sm text-ink-muted">
        Étape {step + 1} sur {STEPS.length}
        {last ? " · parcours terminé" : ""}
      </p>
      <Link href={next.href} className="primary-btn">
        {last ? (
          <>
            <RotateCcw className="h-4 w-4" aria-hidden /> Revenir à la vue d'ensemble
          </>
        ) : (
          <>
            Étape suivante : {next.label} <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </Link>
    </div>
  );
}
