import type { Config } from "tailwindcss";

// Design tokens from the « Wellness Platform — Maquette » canvas.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#15171C",
        secondary: "#3E63DD",
        danger: "#C8513A",
        warning: "#D4A33A",
        success: "#1F8A78",
        surface: "#FFFFFF",
        plane: "#F6F6F3",
        hover: "#EDEDE8",
        ink: { DEFAULT: "#15171C", 2: "#4A4E57", muted: "#61656E", faint: "#7A7E87" },
        hairline: "#E7E7E2",
        line: "#E0E0DA",
        axis: "#CFCFC8",
        brand: { DEFAULT: "#15171C", 50: "#EEF1FD", 100: "#DCE3FB", 600: "#3E63DD", 700: "#2B2E35" },
        accent: { DEFAULT: "#3E63DD", text: "#2A3F9E", soft: "#EEF1FD" },
        band: { best: "#1F8A78", middle: "#D4A33A", bad: "#C8513A", none: "#E2E2DC" },
        dim: { SPORT: "#3E63DD", ENV: "#2F9E6E", HEALTH: "#8E4EC6", SOCIAL: "#E5741D", CLIN: "#80838D" },
      },
      fontFamily: { sans: ["Geist", "system-ui", "-apple-system", "Segoe UI", "sans-serif"] },
      borderRadius: { card: "16px" },
    },
  },
  plugins: [],
};
export default config;
