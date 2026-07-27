import type { Config } from "tailwindcss";

/**
 * Design tokens live as CSS variables in globals.css; this config maps them
 * into Tailwind so utilities stay in sync with the token sheet.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "var(--navy)",
          900: "var(--navy-900)",
          700: "var(--navy-700)",
          100: "var(--navy-100)",
        },
        red: {
          DEFAULT: "var(--red)",
          100: "var(--red-100)",
        },
        yellow: {
          DEFAULT: "var(--yellow)",
          100: "var(--yellow-100)",
        },
        green: {
          DEFAULT: "var(--green)",
          100: "var(--green-100)",
        },
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
        surface: "var(--surface)",
        canvas: "var(--canvas)",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      fontSize: {
        // Type scale from the spec: 12 / 14 / 16 / 20 / 26 / 34 / 46
        xs: ["12px", { lineHeight: "1.5" }],
        sm: ["14px", { lineHeight: "1.6" }],
        base: ["16px", { lineHeight: "1.6" }],
        lg: ["20px", { lineHeight: "1.5" }],
        xl: ["26px", { lineHeight: "1.35", letterSpacing: "-0.02em" }],
        "2xl": ["34px", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        "3xl": ["46px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        card: "12px",
      },
      maxWidth: {
        content: "1100px",
      },
    },
  },
  plugins: [],
};

export default config;
