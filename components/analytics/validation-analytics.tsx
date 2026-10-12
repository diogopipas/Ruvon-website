"use client";

import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { validationJourneyAllowed } from "@/lib/analytics";

export function ValidationAnalytics() {
  const pathname = usePathname();
  if (!validationJourneyAllowed("validation", pathname)) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
