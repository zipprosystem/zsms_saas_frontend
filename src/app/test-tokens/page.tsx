"use client";

import { useState } from "react";

const swatches: { name: string; bgClass: string }[] = [
  { name: "accent", bgClass: "bg-accent" },
  { name: "accent-hover", bgClass: "bg-accent-hover" },
  { name: "brand", bgClass: "bg-brand" },
  { name: "brand-tint", bgClass: "bg-brand-tint" },
  { name: "background", bgClass: "bg-background" },
  { name: "surface", bgClass: "bg-surface" },
  { name: "border", bgClass: "bg-border" },
  { name: "text-primary", bgClass: "bg-text-primary" },
  { name: "text-secondary", bgClass: "bg-text-secondary" },
  { name: "text-muted", bgClass: "bg-text-muted" },
  { name: "success", bgClass: "bg-success" },
  { name: "error", bgClass: "bg-error" },
  { name: "warning", bgClass: "bg-warning" },
  { name: "on-accent", bgClass: "bg-on-accent" },
];

export default function TestTokensPage() {
  const [isDark, setIsDark] = useState(false);

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  return (
    <main className="min-h-screen bg-background text-text-primary p-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">Design Tokens</h1>
        <button
          onClick={toggleDark}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-accent hover:text-on-accent"
        >
          {isDark ? "Switch to Light" : "Switch to Dark"}
        </button>
      </div>

      <section className="mb-10">
        <h2 className="font-display mb-4 text-xl font-semibold">Typography</h2>
        <p className="font-display mb-2 text-2xl">
          Inter (display) — The quick brown fox jumps over the lazy dog
        </p>
        <p className="font-sans text-base">
          Geist (body) — The quick brown fox jumps over the lazy dog
        </p>
      </section>

      <section>
        <h2 className="font-display mb-4 text-xl font-semibold">Color Tokens</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {swatches.map((swatch) => (
            <div
              key={swatch.name}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <div
                className={`h-20 w-full border-b border-border ${swatch.bgClass}`}
              />
              <div className="p-3">
                <p className="text-sm font-medium text-text-primary">
                  {swatch.name}
                </p>
                <p className="text-xs text-text-muted">
                  var(--{swatch.name})
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
