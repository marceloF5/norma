import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        brand: { DEFAULT: "var(--brand)", foreground: "var(--brand-foreground)" },
        phase: {
          backlog: "hsl(var(--phase-backlog))",
          ready: "hsl(var(--phase-ready))",
          in_progress: "hsl(var(--phase-in_progress))",
          needs_review: "hsl(var(--phase-needs_review))",
          needs_qa: "hsl(var(--phase-needs_qa))",
          released: "hsl(var(--phase-released))",
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { lg: "var(--radius)", md: "var(--radius)", sm: "var(--radius)" },
    },
  },
  plugins: [],
} satisfies Config;
