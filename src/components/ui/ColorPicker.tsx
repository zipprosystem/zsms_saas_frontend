"use client";

/**
 * Fixed palette Subject Master auto-assigns from (see
 * getNextUnusedColor) — kept small and visually distinct rather than
 * exhaustive; a custom color is always available via the native picker
 * below for anything the palette doesn't cover.
 */
export const SUBJECT_COLOR_PALETTE = [
  "#852B99",
  "#2563EB",
  "#059669",
  "#D97706",
  "#DC2626",
  "#0891B2",
  "#7C3AED",
  "#DB2777",
  "#65A30D",
  "#EA580C",
] as const;

/** First palette color not already used by an existing subject; cycles back round once the palette is exhausted rather than leaving a new subject colorless. */
export function getNextUnusedColor(usedColors: string[]): string {
  const used = new Set(usedColors.map((color) => color.toLowerCase()));
  const next = SUBJECT_COLOR_PALETTE.find((color) => !used.has(color.toLowerCase()));
  if (next) return next;
  return SUBJECT_COLOR_PALETTE[usedColors.length % SUBJECT_COLOR_PALETTE.length];
}

type ColorPickerProps = {
  id: string;
  label: string;
  value: string;
  onChange: (color: string) => void;
  customLabel: string;
};

export function ColorPicker({ id, label, value, onChange, customLabel }: ColorPickerProps) {
  const isCustom = !(SUBJECT_COLOR_PALETTE as readonly string[]).some(
    (color) => color.toLowerCase() === value.toLowerCase(),
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {SUBJECT_COLOR_PALETTE.map((color) => {
          const selected = !isCustom && color.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={selected}
              onClick={() => onChange(color)}
              style={{ backgroundColor: color }}
              className={`h-8 w-8 rounded-full border-2 transition-transform ${
                selected ? "scale-110 border-text-primary" : "border-transparent hover:scale-105"
              }`}
            />
          );
        })}
        <label
          htmlFor={id}
          title={customLabel}
          aria-label={customLabel}
          style={isCustom ? { backgroundColor: value } : undefined}
          className={`relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 text-xs text-text-muted transition-transform ${
            isCustom ? "scale-110 border-text-primary" : "border-border hover:scale-105"
          }`}
        >
          {!isCustom ? "+" : null}
          <input
            id={id}
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
