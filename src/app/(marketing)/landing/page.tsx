import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingFeatures } from "@/components/marketing/MarketingFeatures";
import { MarketingPricing } from "@/components/marketing/MarketingPricing";

export const metadata: Metadata = {
  title: "ZSMS — Zippro School Management System",
  description:
    "Run your entire school from one place. Academics, attendance, exams, finance, admissions, and more — one platform built for how schools actually work.",
};

export default function LandingPage() {
  // Defense in depth: middleware only rewrites "/" to here on the public
  // platform host (apex/www), but this route is a normal path too, so a
  // validated tenant host (e.g. app.zsmsapp.com/landing) can still reach it
  // directly. If a tenant resolved, we're not on the public host — send
  // them to their portal instead of showing the generic marketing page.
  const tenant = getCurrentTenant();
  if (tenant) {
    redirect("/login");
  }

  return (
    <>
      <MarketingHero />
      <MarketingFeatures />
      <MarketingPricing />
    </>
  );
}
