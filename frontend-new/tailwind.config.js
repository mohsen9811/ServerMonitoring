const withOpacity = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: withOpacity("--color-background"),
        card: withOpacity("--color-card"),
        cardSoft: withOpacity("--color-card-soft"),
        primary: withOpacity("--color-primary"),
        primaryDark: withOpacity("--color-primary-dark"),
        primaryLight: withOpacity("--color-primary-light"),
        textMain: withOpacity("--color-text-main"),
        textMuted: withOpacity("--color-text-muted"),
        border: withOpacity("--color-border"),
        success: withOpacity("--color-success"),
        warning: withOpacity("--color-warning"),
        danger: withOpacity("--color-danger"),
      },
      fontFamily: {
        sans: ["Vazirmatn", "Tahoma", "Arial", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "Courier New", "monospace"],
      },
      boxShadow: {
        soft: "0 2px 8px rgb(0 0 0 / 0.06), 0 1px 2px rgb(0 0 0 / 0.04)",
        card: "0 4px 16px rgb(0 0 0 / 0.06), 0 1px 4px rgb(0 0 0 / 0.04)",
        glow: "0 8px 32px rgb(var(--color-primary) / 0.3)",
        nav: "0 -4px 24px rgb(0 0 0 / 0.06)",
        drawer: "-8px 0 32px rgb(0 0 0 / 0.1)",
        strong: "0 24px 72px rgb(0 0 0 / 0.42)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
        "4xl": "1.5rem",
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        "slide-down": "slide-down 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
      },
    },
  },
  plugins: [],
};