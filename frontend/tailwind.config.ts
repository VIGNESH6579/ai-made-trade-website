import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        customDark: "#0B0E14",
        customPanel: "#161B22",
        brandBull: "#00E676",
        brandBear: "#FF3D00",
      },
    },
  },
  plugins: [],
};
export default config;
