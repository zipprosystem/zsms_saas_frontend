import type { Metadata } from "next";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingFeatures } from "@/components/marketing/MarketingFeatures";
import { MarketingPricing } from "@/components/marketing/MarketingPricing";

export const metadata: Metadata = {
  title: "ZSMS — Zippro School Management System",
  description:
    "Run your entire school from one place. Academics, attendance, exams, finance, admissions, and more — one platform built for how schools actually work.",
};

export default function LandingPage() {
  return (
    <>
      <MarketingHero />
      <MarketingFeatures />
      <MarketingPricing />
    </>
  );
}
