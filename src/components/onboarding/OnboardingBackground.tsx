/**
 * Decorative, education-flavored backdrop for the public onboarding page.
 * Pure CSS/inline-SVG — no image assets, theme-aware via the existing
 * --accent/--accent-2/--brand-tint tokens (so it adapts to dark mode for
 * free). Purely decorative: aria-hidden, pointer-events-none, sits behind
 * the header and form which stay on solid bg-surface/bg-background.
 */
export function OnboardingBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* Faint dot-grid texture — academic "graph paper" feel, very restrained */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: "radial-gradient(var(--text-secondary) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Soft brand-color wash */}
      <div
        className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full opacity-[0.22] blur-3xl"
        style={{ backgroundColor: "var(--accent)" }}
      />
      <div
        className="absolute -bottom-48 -right-32 h-[560px] w-[560px] rounded-full opacity-[0.2] blur-3xl"
        style={{ backgroundColor: "var(--accent-2)" }}
      />

      {/* Faint open-book watermark motif */}
      <svg
        className="absolute bottom-[-40px] right-[6%] h-[300px] w-[300px] opacity-[0.08] sm:h-[420px] sm:w-[420px]"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M100 40C85 28 55 22 30 26v110c25-4 55 2 70 14V40Z"
          stroke="var(--accent)"
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <path
          d="M100 40c15-12 45-18 70-14v110c-25-4-55 2-70 14V40Z"
          stroke="var(--accent)"
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <path d="M100 40v110" stroke="var(--accent)" strokeWidth={3} />
      </svg>
    </div>
  );
}
