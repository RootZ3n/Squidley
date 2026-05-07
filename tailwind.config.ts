import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f5f7fb",
          100: "#e8ecf4",
          200: "#cdd5e3",
          300: "#a3b0c7",
          400: "#6b7a96",
          500: "#475471",
          600: "#2f3a55",
          700: "#1f2740",
          800: "#141a30",
          900: "#0b0f20",
        },
        squid: {
          50: "#eefcff",
          100: "#d6f5ff",
          200: "#aeebff",
          300: "#74dcff",
          400: "#36c4ff",
          500: "#0aa8ee",
          600: "#0086c4",
          700: "#0a6a9b",
          800: "#11587f",
          900: "#10486a",
        },
        iris: {
          50: "#fdf3ff",
          100: "#fae6ff",
          200: "#f3ccff",
          300: "#e6a4ff",
          400: "#d077ff",
          500: "#b14cf2",
          600: "#9132d6",
          700: "#7426ad",
          800: "#5d228a",
          900: "#48196b",
        },
        lotus: {
          50: "#fff1f6",
          100: "#ffe1ed",
          200: "#ffc4dc",
          300: "#ff9bbe",
          400: "#ff6a9c",
          500: "#f5417b",
          600: "#d62662",
          700: "#a91c4f",
          800: "#871a42",
          900: "#6c1638",
        },
      },
      keyframes: {
        breathe: {
          "0%, 100%": { transform: "translateY(0) scale(1)" },
          "50%": { transform: "translateY(-2px) scale(1.015)" },
        },
        "tour-glow": {
          "0%, 100%": {
            boxShadow:
              "0 0 0 0 rgba(54,196,255,0.55), 0 0 0 0 rgba(209,119,255,0.0)",
          },
          "50%": {
            boxShadow:
              "0 0 0 6px rgba(54,196,255,0.18), 0 0 24px 4px rgba(209,119,255,0.25)",
          },
        },
        "panel-in": {
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        breathe: "breathe 6s ease-in-out infinite",
        "tour-glow": "tour-glow 2.4s ease-in-out infinite",
        "panel-in": "panel-in 280ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
      },
      fontFamily: {
        sans: ["Outfit", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        serif: ["Syne", "ui-serif", "Georgia", "Cambria", "Times", "serif"],
        mono: ["DM Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
        display: ["Syne", "ui-serif", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
