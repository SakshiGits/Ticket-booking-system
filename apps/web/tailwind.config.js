/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["'Bebas Neue'", "Inter", "sans-serif"],
      },
      colors: {
        base: "#0a0a0f",
        surface: "#15151d",
        surface2: "#1e1e29",
        border: "#2a2a38",
        accent: "#f5c518", // marquee gold
        accent2: "#ff3b5c", // ticket red
        seatAvailable: "#2a2a38",
        seatHeld: "#f5c518",
        seatBooked: "#ff3b5c",
        seatSelected: "#22c55e",
      },
      boxShadow: {
        glow: "0 0 24px rgba(245, 197, 24, 0.25)",
      },
    },
  },
  plugins: [],
};
