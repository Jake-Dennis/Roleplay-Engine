import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0a0a0a",
          elevated: "#141414",
          raised: "#1e1e1e",
          overlay: "#282828",
        },
        border: {
          DEFAULT: "#2a2a2a",
          strong: "#3a3a3a",
        },
        text: {
          primary: "#e8e8e8",
          secondary: "#a0a0a0",
          muted: "#666666",
        },
        accent: {
          DEFAULT: "#4a9eff",
          hover: "#3a8eef",
        },
        status: {
          success: "#22c55e",
          warning: "#eab308",
          error: "#ef4444",
          info: "#3b82f6",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
