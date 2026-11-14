import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#fcfcfb",
        plane: "#f9f9f7",
        ink: { DEFAULT: "#0b0b0b", 2: "#52514e", muted: "#898781" },
        hairline: "#e1e0d9",
        axis: "#c3c2b7",
        brand: { DEFAULT: "#1f3a5f", 50: "#eef3f9", 100: "#d9e4f2", 600: "#1f3a5f", 700: "#16304f" },
        band: { best: "#0ca30c", middle: "#fab219", bad: "#d03b3b", none: "#e1e0d9" },
      },
      fontFamily: { sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
