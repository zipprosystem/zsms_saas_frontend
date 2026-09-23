"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth/AuthProvider";

// Single choke point for every /admin/* route. The access token is
// in-memory only, so a reload always starts from status "idle" — this is
// what silently calls /auth/refresh (using the httpOnly cookie) to restore
// the session before rendering anything protected.
//
// DEV-ONLY: when AuthProvider's double-gated DEV_AUTH_BYPASS is active
// (NODE_ENV==="development" AND NEXT_PUBLIC_DEV_AUTH_BYPASS==="true"),
// restoreSession() below seeds a mock session and returns "authenticated"
// without ever calling the real /auth/refresh — so this component's logic
// is untouched, it just never takes the network/redirect path in that mode.
// See src/lib/auth/AuthProvider.tsx. MUST NEVER activate in production.
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, restoreSession } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "idle") {
      // restoreSession() recovers the access token via /auth/refresh, then
      // fills in user/school via /auth/me (see AuthProvider.restoreSession)
      // — both are restored after a reload now, not just route access.
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
