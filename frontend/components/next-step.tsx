"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { STEPS } from "@/lib/steps";

/** Discreet « continue » link at the bottom of each main page. */
export function NextStep({ step }: { step: number }) {
  const next = STEPS[(step + 1) % STEPS.length];
  return (
    <div className="no-print mt-8 flex justify-end">
      <Link href={next.href} className="secondary-btn">
        Continuer : {next.label} <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
