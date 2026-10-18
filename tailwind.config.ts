import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#142722",
        muted: "#65766e",
        accent: "#126a4d",
        canvas: "#f4f7f2",
        line: "#e0e8df",
        lime: "#d9f36c"
      },
      boxShadow: { float: "0 20px 65px rgba(18,54,39,.13)" },
      borderRadius: { xl: "1rem", "2xl": "1.5rem" },
      fontFamily: { sans: ["Arial", "Helvetica", "sans-serif"] }
    }
  },
  plugins: []
} satisfies Config;
