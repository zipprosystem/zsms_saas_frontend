import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        brand: "var(--brand)",
        "brand-tint": "var(--brand-tint)",
        background: "var(--background)",
        surface: "var(--surface)",
        border: "var(--border)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        success: "var(--success)",
        error: "var(--error)",
        warning: "var(--warning)",
        "on-accent": "var(--on-accent)",
        "accent-2": "var(--accent-2)",

        "category-purple": "var(--accent)",
        "category-purple-tint": "var(--brand-tint)",
        "category-blue": "var(--category-blue)",
        "category-blue-tint": "var(--category-blue-tint)",
        "category-cyan": "var(--category-cyan)",
        "category-cyan-tint": "var(--category-cyan-tint)",
        "category-green": "var(--category-green)",
        "category-green-tint": "var(--category-green-tint)",
        "category-amber": "var(--category-amber)",
        "category-amber-tint": "var(--category-amber-tint)",
        "subtle-track": "var(--subtle-track)",

        "status-done": "var(--status-done)",
        "status-done-text": "var(--status-done-text)",
        "status-empty-border": "var(--status-empty-border)",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "8px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      fontFamily: {
        sans: ["var(--font-geist)", ...defaultTheme.fontFamily.sans],
        display: ["var(--font-inter)", ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
};
export default config;
