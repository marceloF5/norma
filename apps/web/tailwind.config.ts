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
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        destructive: { DEFAULT: "var(--destructive)", foreground: "var(--primary-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        // phase palette (data-viz)
        phase: {
          backlog: "hsl(var(--phase-backlog))",
          ready: "hsl(var(--phase-ready))",
          in_progress: "hsl(var(--phase-in_progress))",
          needs_rework: "hsl(var(--phase-needs_rework))",
          needs_review: "hsl(var(--phase-needs_review))",
          needs_qa: "hsl(var(--phase-needs_qa))",
          released: "hsl(var(--phase-released))",
          done: "hsl(var(--phase-done))",
        },
      },
      borderRadius: { lg: "var(--radius)", md: "var(--radius)", sm: "var(--radius)" },
    },
  },
  plugins: [],
} satisfies Config;
