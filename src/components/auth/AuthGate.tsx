"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth/AuthProvider";

// Single choke point for every /admin/* route. The access token is
// in-memory only, so a reload always starts from status "idle" — this is
// what silently calls /auth/refresh (using the httpOnly cookie) to restore
// the session before rendering anything protected.
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, restoreSession } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "idle") {
      // restoreSession() only recovers the access token (see the
      // TODO(auth-me) note in AuthProvider.restoreSession) — user/school
      // stay null after a reload until that endpoint exists. Route
      // protection is unaffected; this only matters for anything here that
      // reads useAuth().user / .school.
      restoreSession();
    }
  }, [status, restoreSession]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "authenticated") {
    return <>{children}</>;
  }

  if (status === "unauthenticated") {
    return null;
  }

  return <AuthLoadingState />;
}

function AuthLoadingState() {
  const t = useTranslations();
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-background">
      <p className="text-base text-text-secondary">{t("onboarding.common.loading")}</p>
    </div>
  );
}
