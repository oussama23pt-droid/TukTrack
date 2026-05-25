/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Poppins", "sans-serif"],
      },
      colors: {
        navy: "#0A1F44",
        amber: {
          DEFAULT: "#F5A623",
          50:  "#FEF6E7",
          100: "#FDECD0",
          200: "#FBD9A0",
          300: "#F9C671",
          400: "#F7B341",
          500: "#F5A623",
          600: "#D4880A",
          700: "#A06607",
          800: "#6C4405",
          900: "#382202",
        },
        "glass-light": "rgba(255, 255, 255, 0.7)",
        "glass-white": "rgba(255, 255, 255, 0.1)",
      },
      borderRadius: {
        card: "24px",
        button: "16px",
      },
    },
  },
  plugins: [],
}
