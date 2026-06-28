import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0e14",
        panel: "#11161f",
        edge: "#1e2733",
        warden: "#3ddc97",
        block: "#ff5470",
        review: "#ffb454",
        clear: "#3ddc97",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
