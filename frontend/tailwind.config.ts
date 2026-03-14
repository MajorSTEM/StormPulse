import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        tornado: {
          warning: "#FF0000",
          watch: "#FFFF00",
          corridor: "#FF6B00",
          survey: "#800080",
        },
        tier: {
          t1: "#22c55e",
          t2: "#3b82f6",
          t3: "#f97316",
          t4: "#6b7280",
        }
      }
    },
  },
  plugins: [],
};

export default config;
