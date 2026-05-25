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
        amber: "#F5A623",
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
