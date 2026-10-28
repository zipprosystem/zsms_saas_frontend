"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/ui/Toast";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // The shell scrolls inside <main>, never the page. Lock page scroll while
  // it's mounted (scoped here, not in globals.css, so auth / onboarding /
  // marketing pages keep normal document scrolling).
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  return (
    <ToastProvider>
      {/* relative (here and on <main>): absolutely-positioned descendants —
          sr-only labels, visually hidden inputs — otherwise resolve against
          the page itself, grow the document past this h-dvh frame and let
          the page scroll into empty space below the content. */}
      <div className="relative flex h-dvh overflow-hidden bg-background">
        <Sidebar isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />

        {isMobileNavOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setIsMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}

        <div className="flex h-dvh min-w-0 flex-1 flex-col">
          <Header onOpenMobileNav={() => setIsMobileNavOpen(true)} />
          <main className="relative min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[1440px] flex-col px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
