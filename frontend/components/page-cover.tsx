"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { coverBackground } from "@/lib/covers";

/** Cover photo across the whole width of the content area, fading into the page colour. */
export function PageCover({ url }: { url: string }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById("page-cover"));
  }, []);
  if (!target) return null;
  return createPortal(<div className="h-[274px] w-full opacity-30" style={{ background: coverBackground(url) }} />, target);
}
